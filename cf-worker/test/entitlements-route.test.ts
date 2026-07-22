import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { createFakeSql, type FakeSql } from "./helpers/fakeSql";
import { makeEnv } from "./helpers/env";
import { FetchStub } from "./helpers/fetchStub";
import { createAuthKit, validClaims, type AuthKit } from "./helpers/jwt";
import type { Env } from "../src/types";

// GET /api/entitlements (hub payments Phase 1), end to end through src/index:
// real CORS + real requireAuth (ES256 JWKS via the fetch stub) + the hub
// entitlements helper (hub endpoint via the fetch stub) + the local tier lookup
// (fakeSql). Contract: effective game-ladder tier = MAX(local effective tier,
// hub tier), each source failing closed to free independently, 200 always.

const pg = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("postgres", () => ({ default: () => pg.current }));

import app from "../src/index";

const ISSUER = "https://auth.test";
const JWKS_URL = `${ISSUER}/auth/v1/.well-known/jwks.json`;
const HUB_URL = "https://hub.test";
const HUB_ENDPOINT = `${HUB_URL}/api/me/entitlements`;

// Unique sub per test: the helper's 60 s cache is per-user module state.
let userSeq = 0;
const nextUser = () => `route-user-${++userSeq}`;

let kit: AuthKit;
let fetchStub: FetchStub;
let sql: FakeSql;

beforeAll(async () => {
  kit = await createAuthKit();
});

beforeEach(() => {
  fetchStub = new FetchStub().install();
  // JWKS stays registered for every test; the auth middleware caches keys for
  // 10 minutes per isolate, so most tests never actually hit this.
  fetchStub.on(JWKS_URL, () => kit.jwks);
  sql = createFakeSql();
  pg.current = sql;
});

afterEach(() => {
  fetchStub.restore();
});

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

async function get(headers: Record<string, string> = {}) {
  const env: Env = makeEnv({ OCTONION_SUPABASE_URL: ISSUER, HUB_URL });
  const ctx = createExecutionContext();
  const res = await app.request(
    "/api/entitlements",
    { headers: { Origin: "http://localhost:3000", ...headers } },
    env,
    ctx
  );
  await waitOnExecutionContext(ctx);
  return res;
}

async function getAs(sub: string) {
  const token = await kit.signToken(validClaims(ISSUER, { sub }));
  return get({ Authorization: `Bearer ${token}` });
}

describe("GET /api/entitlements: auth", () => {
  it("401s without a token (requireAuth guards the route)", async () => {
    const res = await get();
    expect(res.status).toBe(401);
  });
});

describe("GET /api/entitlements: snapshot", () => {
  it("reports free with the hub free shape for a fresh account (no rows, hub free)", async () => {
    fetchStub.on(HUB_ENDPOINT, () => hubPayload("free"));
    const res = await getAs(nextUser());
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      tier: "free",
      updatedAt: null,
      expiresAt: null,
      hub: hubPayload("free"),
      usage: null, // free tier has no premium allowance to meter
    });
  });

  it("forwards the caller's own JWT to the hub as the Bearer credential", async () => {
    fetchStub.on(HUB_ENDPOINT, () => hubPayload("free"));
    const sub = nextUser();
    const token = await kit.signToken(validClaims(ISSUER, { sub }));
    await get({ Authorization: `Bearer ${token}` });
    const hubReq = fetchStub.requests.find((r) => r.url === HUB_ENDPOINT);
    expect(hubReq?.headers.authorization).toBe(`Bearer ${token}`);
  });

  it("maps a hub 'members' subscription to game tier 'member'", async () => {
    fetchStub.on(HUB_ENDPOINT, () => hubPayload("members"));
    const res = await getAs(nextUser());
    const json = (await res.json()) as any;
    expect(json.tier).toBe("member");
    expect(json.hub.tier).toBe("members"); // raw hub snapshot passes through
  });

  it("reports the HIGHER of local and hub tiers (local premium beats hub members)", async () => {
    fetchStub.on(HUB_ENDPOINT, () => hubPayload("members"));
    sql.onQuery(/FROM account_tiers/, () => [
      { src: "base", tier: "premium", ts: "2026-07-01T00:00:00Z" },
    ]);
    const res = await getAs(nextUser());
    const json = (await res.json()) as any;
    expect(json.tier).toBe("premium");
    expect(json.updatedAt).toBe("2026-07-01T00:00:00Z");
  });

  it("a local redemption-code grant still counts when the hub says free", async () => {
    fetchStub.on(HUB_ENDPOINT, () => hubPayload("free"));
    sql.onQuery(/FROM account_tiers/, () => [
      { src: "grant", tier: "member", ts: "2026-08-05T00:00:00.000Z" },
    ]);
    const res = await getAs(nextUser());
    const json = (await res.json()) as any;
    expect(json.tier).toBe("member");
    expect(json.expiresAt).toBe("2026-08-05T00:00:00.000Z");
  });
});

describe("GET /api/entitlements: usage meter (backlog #6 visibility slice)", () => {
  it("member+ callers get read-only premium allowance meters from request_counters", async () => {
    fetchStub.on(HUB_ENDPOINT, () => hubPayload("members"));
    sql.onQuery(/FROM request_counters/, (q) =>
      q.values.includes("ai-premium-daily") ? [{ count: 7 }] : [{ count: 42 }]
    );
    const res = await getAs(nextUser());
    const json = (await res.json()) as any;
    expect(json.tier).toBe("member");
    expect(json.usage).toEqual({
      premiumDaily: { used: 7, limit: 100 },
      premiumMonthly: { used: 42, limit: 800 },
    });
  });

  it("meters scale with the tier's limits (elite)", async () => {
    fetchStub.on(HUB_ENDPOINT, () => hubPayload("elite"));
    // No counter rows this window: a fresh day/month reads 0, not an error.
    const res = await getAs(nextUser());
    const json = (await res.json()) as any;
    expect(json.usage).toEqual({
      premiumDaily: { used: 0, limit: 300 },
      premiumMonthly: { used: 0, limit: 4000 },
    });
  });

  it("a counter outage nulls the meter but never the snapshot (fail-soft)", async () => {
    fetchStub.on(HUB_ENDPOINT, () => hubPayload("members"));
    sql.onQuery(/FROM request_counters/, () => {
      throw new Error("counters down");
    });
    const res = await getAs(nextUser());
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.tier).toBe("member");
    expect(json.usage).toBe(null);
  });

  it("free tier never reads counters and reports usage null", async () => {
    fetchStub.on(HUB_ENDPOINT, () => hubPayload("free"));
    const counterReads: string[] = [];
    sql.onQuery(/FROM request_counters/, (q) => {
      counterReads.push(q.text);
      return [{ count: 5 }];
    });
    const res = await getAs(nextUser());
    const json = (await res.json()) as any;
    expect(json.usage).toBe(null);
    expect(counterReads).toEqual([]);
  });
});

describe("GET /api/entitlements: fail-closed independence", () => {
  it("hub outage: still 200, local tier stands, hub reports the free shape", async () => {
    fetchStub.on(HUB_ENDPOINT, () => {
      throw new Error("hub down");
    });
    sql.onQuery(/FROM account_tiers/, () => [
      { src: "base", tier: "member", ts: "2026-07-01T00:00:00Z" },
    ]);
    const res = await getAs(nextUser());
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.tier).toBe("member");
    expect(json.hub.tier).toBe("free");
  });

  it("game-DB outage: still 200, hub tier stands (never the old 500)", async () => {
    fetchStub.on(HUB_ENDPOINT, () => hubPayload("members"));
    sql.onQuery(/FROM account_tiers/, () => {
      throw new Error("db down");
    });
    const res = await getAs(nextUser());
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.tier).toBe("member");
    expect(json.updatedAt).toBe(null);
  });

  it("both sources down: plain free, still 200 (errors never break free-tier play)", async () => {
    fetchStub.on(HUB_ENDPOINT, () => new Response("oops", { status: 500 }));
    sql.onQuery(/FROM account_tiers/, () => {
      throw new Error("db down");
    });
    const res = await getAs(nextUser());
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).tier).toBe("free");
  });

  it("closes the sql client even on a DB error", async () => {
    fetchStub.on(HUB_ENDPOINT, () => hubPayload("free"));
    sql.onQuery(/FROM account_tiers/, () => {
      throw new Error("db down");
    });
    await getAs(nextUser());
    expect(sql.ended).toBe(true);
  });
});
