// Hub payments Phase 3: server-side member gates consult the Octonion hub tier
// (octonion-io-website docs/payments-spec.md "Phased rollout / Phase 3").
//
// Both enforcement points admit on MAX(local tier, hub tier) via
// services/mergedTier.ts:
//   - POST /api/ai/generate premium pool gate (backlog #7/#39)
//   - GET /api/db/premium-templates content delivery (backlog #40)
//
// Full-stack, same pattern as entitlements-route.test.ts / test/premium/: requests
// go through the real app (src/index), authenticated with genuinely signed ES256
// JWTs against a stubbed JWKS endpoint. Postgres is the fakeSql mock; the hub,
// JWKS and OpenRouter are fetch-stubbed; the free pool is a stub AI binding.
// No credentials, no network, no database.

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { createFakeSql, type FakeSql } from "./helpers/fakeSql";
import { makeEnv, stubAi, type StubAi } from "./helpers/env";
import { FetchStub } from "./helpers/fetchStub";
import { createAuthKit, validClaims, type AuthKit } from "./helpers/jwt";
import { PREMIUM_DAILY_LIMITS } from "../src/middleware/rateLimit";
import type { Env } from "../src/types";

const pg = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("postgres", () => ({ default: () => pg.current }));

import app from "../src/index";

const ISSUER = "https://auth.test";
const JWKS_URL = `${ISSUER}/auth/v1/.well-known/jwks.json`;
const HUB_URL = "https://hub.test";
const HUB_ENDPOINT = `${HUB_URL}/api/me/entitlements`;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Unique sub per test: the hub helper's 60 s cache is per-user module state.
let userSeq = 0;
const nextUser = () => `gate-user-${++userSeq}`;

let kit: AuthKit;
let fetchStub: FetchStub;
let sql: FakeSql;
let ai: StubAi;

beforeAll(async () => {
  kit = await createAuthKit();
});

beforeEach(() => {
  fetchStub = new FetchStub().install();
  fetchStub.on(JWKS_URL, () => kit.jwks);
  sql = createFakeSql();
  pg.current = sql;
  ai = stubAi(() => ({ response: "free pool narration" }));
});

afterEach(() => {
  fetchStub.restore();
});

function env(): Env {
  return makeEnv({
    OCTONION_SUPABASE_URL: ISSUER,
    HUB_URL,
    OPENROUTER_API_KEY: "sk-or-test-key",
    AI: ai.binding,
  } as Partial<Env>);
}

function hubPayload(tier: string) {
  return {
    tier,
    status: "active",
    lifetime: false,
    currentPeriodEnd: "2026-08-01T00:00:00.000Z",
    perks: {},
    credits: null,
  };
}

const hubCalls = () => fetchStub.requests.filter((r) => r.url === HUB_ENDPOINT);
const openRouterCalls = () =>
  fetchStub.requests.filter((r) => r.url.startsWith("https://openrouter.ai"));

/** Local-tier row + counter plumbing for the fake DB. */
function setupDb(opts: {
  localTier?: string | null;
  localError?: boolean;
  premiumCount?: number;
} = {}) {
  const { localTier = null, localError = false, premiumCount = 1 } = opts;
  sql.onQuery(/FROM account_tiers/, () => {
    if (localError) throw new Error("db down");
    return localTier ? [{ src: "base", tier: localTier, ts: "2026-07-01T00:00:00Z" }] : [];
  });
  sql.onQuery(/INSERT INTO request_counters/, (q) => {
    // Same counter table serves the 5-minute ai-generate bucket (count 1,
    // always under) and the daily/monthly premium buckets (test-controlled daily).
    const bucket = q.values[1];
    return [{ count: bucket === "ai-premium-daily" ? premiumCount : 1 }];
  });
}

async function request(path: string, sub: string, init: RequestInit = {}) {
  const token = await kit.signToken(validClaims(ISSUER, { sub }));
  const ctx = createExecutionContext();
  const res = await app.request(
    path,
    {
      ...init,
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    },
    env(),
    ctx
  );
  await waitOnExecutionContext(ctx);
  return res;
}

// ─── Premium AI pool gate (POST /api/ai/generate) ─────────────────────────────

const premiumBody = JSON.stringify({
  provider: "cf-workers",
  model: "@cf/openai/gpt-oss-120b",
  prompt: "Narrate the throne room.",
  pool: "premium",
});

const generateAs = (sub: string, body: string = premiumBody) =>
  request("/api/ai/generate", sub, { method: "POST", body });

describe("premium AI pool gate: hub tier merge (Phase 3)", () => {
  it("admits a hub-only member (no local row) to the premium pool", async () => {
    setupDb({ localTier: null });
    fetchStub.on(HUB_ENDPOINT, () => hubPayload("members")); // hub ladder spelling
    fetchStub.on(OPENROUTER_URL, () => ({
      choices: [{ message: { content: "premium narration" } }],
    }));

    const res = await generateAs(nextUser());
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.pool).toBe("premium");
    expect(json.text).toBe("premium narration");
    expect(ai.calls.length).toBe(0); // free binding untouched
  });

  it("forwards the caller's own verified JWT to the hub", async () => {
    setupDb({ localTier: null });
    fetchStub.on(HUB_ENDPOINT, () => hubPayload("members"));
    fetchStub.on(OPENROUTER_URL, () => ({
      choices: [{ message: { content: "ok" } }],
    }));

    const sub = nextUser();
    const token = await kit.signToken(validClaims(ISSUER, { sub }));
    const ctx = createExecutionContext();
    await app.request(
      "/api/ai/generate",
      {
        method: "POST",
        body: premiumBody,
        headers: {
          Origin: "http://localhost:3000",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      },
      env(),
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(hubCalls()[0]?.headers.authorization).toBe(`Bearer ${token}`);
  });

  it("admits a local-only member WITHOUT calling the hub (short-circuit)", async () => {
    setupDb({ localTier: "member" });
    // No hub handler on purpose: a hub call would fail loudly inside the helper
    // and 403 this test. The local rung already satisfies member+, so the hub
    // round trip must be skipped entirely.
    fetchStub.on(OPENROUTER_URL, () => ({
      choices: [{ message: { content: "premium narration" } }],
    }));

    const res = await generateAs(nextUser());
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).pool).toBe("premium");
    expect(hubCalls()).toHaveLength(0);
  });

  it("403 premium_required when both sources say free (unchanged contract)", async () => {
    setupDb({ localTier: null });
    fetchStub.on(HUB_ENDPOINT, () => hubPayload("free"));

    const res = await generateAs(nextUser());
    expect(res.status).toBe(403);
    expect(((await res.json()) as any).code).toBe("premium_required");
    expect(openRouterCalls()).toHaveLength(0);
  });

  it("hub outage + no local row: denied, never widened on error", async () => {
    setupDb({ localTier: null });
    fetchStub.on(HUB_ENDPOINT, () => new Response("down", { status: 500 }));

    const res = await generateAs(nextUser());
    expect(res.status).toBe(403);
    expect(((await res.json()) as any).code).toBe("premium_required");
    expect(openRouterCalls()).toHaveLength(0);
  });

  it("local DB error + hub member: admitted (local degrades to free, hub wins)", async () => {
    setupDb({ localError: true });
    fetchStub.on(HUB_ENDPOINT, () => hubPayload("members"));
    fetchStub.on(OPENROUTER_URL, () => ({
      choices: [{ message: { content: "premium narration" } }],
    }));

    const res = await generateAs(nextUser());
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.pool).toBe("premium");
    expect(json.fallbackFrom).toBeUndefined();
  });

  it("hub members still pass through the LOCAL daily allowance (429 premium_cap)", async () => {
    setupDb({ localTier: null, premiumCount: PREMIUM_DAILY_LIMITS.member + 1 });
    fetchStub.on(HUB_ENDPOINT, () => hubPayload("members"));

    const res = await generateAs(nextUser());
    expect(res.status).toBe(429);
    expect(((await res.json()) as any).code).toBe("premium_cap");
    expect(openRouterCalls()).toHaveLength(0);
  });

  it("free-pool requests never consult the hub", async () => {
    setupDb({ localTier: null });
    const body = JSON.stringify({
      provider: "cf-workers",
      model: "@cf/openai/gpt-oss-120b",
      prompt: "Narrate the tavern.",
    });

    const res = await generateAs(nextUser(), body);
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).pool).toBe("free");
    expect(hubCalls()).toHaveLength(0);
  });
});

// ─── Member content delivery (GET /api/db/premium-templates) ──────────────────

// Full authored templates as stored; settings are the protected content and must
// only reach entitled callers (same fixtures as db-routes.test.ts).
const templateRows = [
  {
    id: "desert-x",
    min_tier: "member",
    template: {
      id: "desert-x", name: "Desert", subtitle: "The Dunes", tier: 2,
      levelRange: [3, 5], shortDescription: "Sand.", theme: "desert",
      minTier: "member",
      settings: { milestones: [{ id: 1, text: "secret" }] },
    },
  },
  {
    id: "snow-x",
    min_tier: "premium",
    template: {
      id: "snow-x", name: "Snow", subtitle: "The Drifts", tier: 3,
      levelRange: [5, 7], shortDescription: "Cold.", theme: "snow",
      minTier: "premium",
      settings: { milestones: [{ id: 1, text: "secret" }] },
    },
  },
];

const templatesAs = (sub: string) => request("/api/db/premium-templates", sub);

describe("premium content delivery: hub tier merge (Phase 3)", () => {
  beforeEach(() => {
    sql.onQuery(/FROM premium_templates/, () => templateRows);
  });

  it("delivers member content to a hub-only member (no local row)", async () => {
    setupDb({ localTier: null });
    fetchStub.on(HUB_ENDPOINT, () => hubPayload("members"));

    const res = await templatesAs(nextUser());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { templates: any[] };
    expect(body.templates[0].settings.milestones).toHaveLength(1); // full member row
    expect(body.templates[0].teaser).toBeUndefined();
    expect(body.templates[1].teaser).toBe(true); // premium row stays teased
    expect(body.templates[1]).not.toHaveProperty("settings");
  });

  it("local-only member keeps their content through a hub outage", async () => {
    setupDb({ localTier: "member" });
    fetchStub.on(HUB_ENDPOINT, () => {
      throw new Error("hub down");
    });

    const res = await templatesAs(nextUser());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { templates: any[] };
    expect(body.templates[0].settings).toBeTruthy();
    expect(body.templates[0].teaser).toBeUndefined();
  });

  it("both sources free: teasers only, no protected content (unchanged)", async () => {
    setupDb({ localTier: null });
    fetchStub.on(HUB_ENDPOINT, () => hubPayload("free"));

    const res = await templatesAs(nextUser());
    const body = (await res.json()) as { templates: any[] };
    expect(body.templates).toHaveLength(2);
    for (const t of body.templates) {
      expect(t.teaser).toBe(true);
      expect(JSON.stringify(t)).not.toContain("secret");
    }
  });

  it("hub outage + no local row: teasers only, never widened on error", async () => {
    setupDb({ localTier: null });
    fetchStub.on(HUB_ENDPOINT, () => new Response("down", { status: 500 }));

    const res = await templatesAs(nextUser());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { templates: any[] };
    expect(body.templates.every((t) => t.teaser === true)).toBe(true);
  });

  it("local DB error + hub member: member content still delivered", async () => {
    setupDb({ localError: true });
    fetchStub.on(HUB_ENDPOINT, () => hubPayload("members"));

    const res = await templatesAs(nextUser());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { templates: any[] };
    expect(body.templates[0].settings).toBeTruthy();
    expect(body.templates[1].teaser).toBe(true);
  });

  it("a higher hub tier raises a local member (hub premium unlocks the premium row)", async () => {
    // Unlike the fixed member+ AI gate, the content route must consult the hub
    // even when the local tier is already member: min_tier varies per row.
    setupDb({ localTier: "member" });
    fetchStub.on(HUB_ENDPOINT, () => hubPayload("premium"));

    const res = await templatesAs(nextUser());
    const body = (await res.json()) as { templates: any[] };
    expect(body.templates.every((t) => !t.teaser && t.settings)).toBe(true);
  });

  it("a local elite skips the hub entirely (nothing left to raise)", async () => {
    setupDb({ localTier: "elite" });
    // No hub handler: a hub call would throw inside the helper; irrelevant either
    // way, but the assertion below pins that the round trip never happens.

    const res = await templatesAs(nextUser());
    const body = (await res.json()) as { templates: any[] };
    expect(body.templates.every((t) => !t.teaser && t.settings)).toBe(true);
    expect(hubCalls()).toHaveLength(0);
  });
});
