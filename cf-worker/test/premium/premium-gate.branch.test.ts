// BRANCH-GATED SUITE: premium-ai-ratelimit
//
// Covers the premium pool gate inside POST /api/ai/generate (backlog #7):
// tier gating (403 premium_required), the daily allowance (429 premium_cap),
// degrade-to-free on DB or OpenRouter trouble, and the server-side model pin.
// The gate only exists on the branch; this file keys its activation off
// src/services/openrouter.ts (merged together with the routes/ai.ts changes)
// and skips cleanly on master.
//
// Full-stack: requests go through the real app (index.ts), authenticated with a
// genuinely signed ES256 JWT against a stubbed JWKS endpoint. Postgres is the
// fakeSql mock; OpenRouter and JWKS are fetch-stubbed; the free pool is a stub
// AI binding. No credentials, no network, no database.

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import app from "../../src/index";
import { createFakeSql, type FakeSql } from "../helpers/fakeSql";
import { makeEnv, makeBypassEnv, stubAi, type StubAi } from "../helpers/env";
import { FetchStub } from "../helpers/fetchStub";
import { createAuthKit, validClaims, type AuthKit } from "../helpers/jwt";
import type { Env } from "../../src/types";

const pg = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("postgres", () => ({ default: () => pg.current }));

const or: any = await import("../../src/services/openrouter" as string).catch(
  () => null
);

it(`openrouter module ${or ? "present: suite active" : "absent (master): suite skipped"}`, () => {
  expect(true).toBe(true);
});

const ISSUER = "https://auth.test";
const JWKS_URL = `${ISSUER}/auth/v1/.well-known/jwks.json`;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const USER = "user-premium-1";

describe.skipIf(!or)("POST /api/ai/generate premium pool gate", () => {
  let kit: AuthKit;
  let token: string;
  let sql: FakeSql;
  let ai: StubAi;
  let fetchStub: FetchStub;

  beforeAll(async () => {
    kit = await createAuthKit();
    token = await kit.signToken(validClaims(ISSUER, { sub: USER }));
  });

  beforeEach(() => {
    sql = createFakeSql();
    pg.current = sql;
    ai = stubAi(() => ({ response: "free pool narration" }));
    fetchStub = new FetchStub().install().on(JWKS_URL, () => kit.jwks);
  });

  afterEach(() => {
    fetchStub.restore();
  });

  function env(overrides: Partial<Env> = {}): Env {
    return makeEnv({
      OCTONION_SUPABASE_URL: ISSUER,
      OPENROUTER_API_KEY: "sk-or-test-key",
      AI: ai.binding,
      ...overrides,
    } as Partial<Env>);
  }

  async function generate(body: Record<string, unknown>, testEnv: Env) {
    const ctx = createExecutionContext();
    const res = await app.request(
      "/api/ai/generate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      },
      testEnv,
      ctx
    );
    await waitOnExecutionContext(ctx);
    return res;
  }

  const premiumBody = {
    provider: "cf-workers",
    model: "@cf/openai/gpt-oss-120b", // client model id: must be IGNORED on premium
    prompt: "Narrate the throne room.",
    pool: "premium",
  };

  /** Tier row + counter plumbing for the fake DB. */
  function setupDb(opts: {
    tier?: string | null;
    premiumCount?: number;
    tierError?: boolean;
  }) {
    const { tier = null, premiumCount = 1, tierError = false } = opts;
    sql.onQuery(/FROM account_tiers/, () => {
      if (tierError) throw new Error("db down");
      return tier ? [{ tier }] : [];
    });
    sql.onQuery(/INSERT INTO request_counters/, (q) => {
      // Same counter table serves the 5-minute ai-generate bucket (count 1,
      // always under) and the daily premium bucket (test-controlled).
      const bucket = q.values[1];
      return [{ count: bucket === "ai-premium-daily" ? premiumCount : 1 }];
    });
  }

  it("403 premium_required for a free-tier account", async () => {
    setupDb({ tier: null });
    const res = await generate(premiumBody, env());
    expect(res.status).toBe(403);
    const json = (await res.json()) as any;
    expect(json.code).toBe("premium_required");
    expect(fetchStub.requests.every((r) => !r.url.startsWith("https://openrouter.ai"))).toBe(true);
  });

  it("403 premium_required with no identity (ALLOW_UNAUTHENTICATED_DEV bypass fails closed)", async () => {
    setupDb({ tier: "elite" });
    const ctx = createExecutionContext();
    const res = await app.request(
      "/api/ai/generate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(premiumBody),
      },
      makeBypassEnv({ AI: ai.binding, OPENROUTER_API_KEY: "sk-or-test-key" } as Partial<Env>),
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(403);
    expect(((await res.json()) as any).code).toBe("premium_required");
  });

  it("member within allowance: 200 from the premium pool, client model id ignored", async () => {
    setupDb({ tier: "member", premiumCount: 1 });
    fetchStub.on(OPENROUTER_URL, () => ({
      choices: [{ message: { content: "premium narration" } }],
    }));

    const res = await generate(premiumBody, env());
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.pool).toBe("premium");
    expect(json.text).toBe("premium narration");
    expect(json.fallbackFrom).toBeUndefined();

    // Server pins the pool model: the client's @cf/... id never reaches OpenRouter.
    const orReq = fetchStub.requests.find((r) =>
      r.url.startsWith("https://openrouter.ai")
    )!;
    expect((orReq.json as any).model).toBe(or.DEFAULT_PREMIUM_MODEL_ID);
    // And the free Workers AI binding is never touched.
    expect(ai.calls.length).toBe(0);
  });

  it("429 premium_cap once the member's daily allowance is spent", async () => {
    const { PREMIUM_DAILY_LIMITS } = (await import(
      "../../src/middleware/rateLimit" as string
    )) as any;
    setupDb({ tier: "member", premiumCount: PREMIUM_DAILY_LIMITS.member + 1 });

    const res = await generate(premiumBody, env());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toMatch(/^\d+$/);
    const json = (await res.json()) as any;
    expect(json.code).toBe("premium_cap");
    expect(typeof json.retryAfterSeconds).toBe("number");
  });

  it("premium tier gets the higher daily allowance", async () => {
    const { PREMIUM_DAILY_LIMITS } = (await import(
      "../../src/middleware/rateLimit" as string
    )) as any;
    // A count over the member cap but within the premium cap must pass.
    setupDb({ tier: "premium", premiumCount: PREMIUM_DAILY_LIMITS.member + 1 });
    fetchStub.on(OPENROUTER_URL, () => ({
      choices: [{ message: { content: "ok" } }],
    }));

    const res = await generate(premiumBody, env());
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).pool).toBe("premium");
  });

  it("DB error during the gate degrades to the FREE pool (never opens the paid one)", async () => {
    setupDb({ tierError: true });

    const res = await generate(premiumBody, env());
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.pool).toBe("free");
    expect(json.fallbackFrom).toBe("premium");
    expect(json.fallbackReason).toBe("premium_error");
    expect(json.text).toBe("free pool narration");
    // Paid pool untouched, free binding did the work.
    expect(
      fetchStub.requests.every((r) => !r.url.startsWith("https://openrouter.ai"))
    ).toBe(true);
    expect(ai.calls.length).toBeGreaterThan(0);
  });

  it("OpenRouter failure falls back to the free pool and says so", async () => {
    setupDb({ tier: "member", premiumCount: 1 });
    fetchStub.on(OPENROUTER_URL, () => new Response("down", { status: 500 }));

    const res = await generate(premiumBody, env());
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.pool).toBe("free");
    expect(json.fallbackFrom).toBe("premium");
    expect(json.text).toBe("free pool narration");
  });

  it("missing OPENROUTER_API_KEY degrades quality, not availability", async () => {
    setupDb({ tier: "member", premiumCount: 1 });
    // OPENROUTER_API_KEY is not in master's Env type (the branch adds it).
    const res = await generate(
      premiumBody,
      env({ OPENROUTER_API_KEY: undefined } as Partial<Env>)
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.pool).toBe("free");
    expect(json.fallbackFrom).toBe("premium");
  });

  it("absent/unknown pool values run the free pool with no premium fields", async () => {
    setupDb({ tier: "member" });
    for (const pool of [undefined, "garbage"]) {
      const res = await generate({ ...premiumBody, pool }, env());
      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.pool).toBe("free");
      expect(json.fallbackFrom).toBeUndefined();
    }
    // The tier lookup never even runs for free-pool requests.
    expect(sql.calls.every((c) => !c.text.includes("account_tiers"))).toBe(true);
  });
});
