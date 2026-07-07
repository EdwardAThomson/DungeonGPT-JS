import { describe, it, expect, vi, beforeEach } from "vitest";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { Hono } from "hono";
import { createFakeSql, type FakeSql } from "./helpers/fakeSql";
import { makeEnv } from "./helpers/env";
import type { Env } from "../src/types";
import type { AuthVariables } from "../src/middleware/auth";

// Postgres seam: identical to db-routes.test.ts, mock the postgres module so
// getSql hands back the fake and no test opens a socket.
const pg = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("postgres", () => ({ default: () => pg.current }));

import dbRoutes from "../src/routes/db";
import { getEffectiveTier } from "../src/services/tiers";
import { normalizeCode } from "../src/services/redemption";

const USER = "user-redeem-1";
const CODE = "ABCD-EFGH-JKLM";

function makeApp() {
  const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
  app.use("*", async (c, next) => {
    c.set("userId", USER);
    await next();
  });
  app.route("/", dbRoutes);
  return app;
}

async function redeem(code: unknown) {
  const ctx = createExecutionContext();
  const res = await makeApp().request(
    "/redeem-code",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    },
    makeEnv(),
    ctx
  );
  await waitOnExecutionContext(ctx);
  return res;
}

let sql: FakeSql;

/** Default happy-path handlers; individual tests override by registering first. */
function stubHappyPath() {
  sql.onQuery(/INSERT INTO request_counters/, () => [{ count: 1 }]);
  sql.onQuery(/FROM code_redemptions/, () => []);
  sql.onQuery(/UPDATE redemption_codes/, () => [
    { grants_tier: "member", grant_days: 30 },
  ]);
  sql.onQuery(/INSERT INTO tier_grants/, () => [
    { tier: "member", expires_at: new Date("2026-08-06T12:00:00.000Z") },
  ]);
  sql.onQuery(/INSERT INTO code_redemptions/, () => []);
}

beforeEach(() => {
  sql = createFakeSql();
  pg.current = sql;
});

describe("normalizeCode", () => {
  it("uppercases and strips spaces/dashes into the canonical dashed form", () => {
    expect(normalizeCode("abcd efgh jklm")).toBe(CODE);
    expect(normalizeCode("ABCD-EFGH-JKLM")).toBe(CODE);
    expect(normalizeCode("  abcdefghjklm ")).toBe(CODE);
  });

  it("rejects wrong length, excluded characters (0/O/1/I) and non-strings", () => {
    expect(normalizeCode("ABCD-EFGH")).toBeNull();
    expect(normalizeCode("ABCD-EFGH-JKL0")).toBeNull();
    expect(normalizeCode("ABCD-EFGH-JKLO")).toBeNull();
    expect(normalizeCode("ABCD-EFGH-JKL1")).toBeNull();
    expect(normalizeCode("ABCD-EFGH-JKLI")).toBeNull();
    expect(normalizeCode(42)).toBeNull();
    expect(normalizeCode(undefined)).toBeNull();
  });
});

describe("POST /redeem-code", () => {
  it("happy path: claims the code atomically in a transaction and returns the grant", async () => {
    stubHappyPath();
    const res = await redeem("abcd efgh jklm"); // messy input normalizes to CODE
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      tier: "member",
      expiresAt: "2026-08-06T12:00:00.000Z",
    });

    // Everything ran inside one transaction.
    expect(sql.begins).toBe(1);

    // The claim is the atomic conditional UPDATE: all four liveness conditions and
    // the increment in ONE statement, so a race on the last use cannot oversubscribe.
    const claim = sql.calls.find((q) => q.text.includes("UPDATE redemption_codes"))!;
    expect(claim.text).toMatch(/SET uses = uses \+ 1/);
    expect(claim.text).toContain("disabled = false");
    expect(claim.text).toContain("expires_at > now()");
    expect(claim.text).toContain("uses < max_uses");
    expect(claim.text).toContain("RETURNING grants_tier, grant_days");
    expect(claim.values).toContain(CODE); // canonical dashed form hits the DB

    // The grant is source-tagged and time-boxed by grant_days.
    const grant = sql.calls.find((q) => q.text.includes("INSERT INTO tier_grants"))!;
    expect(grant.text).toContain("make_interval(days =>");
    expect(grant.values).toEqual(expect.arrayContaining([USER, "member", 30, `code:${CODE}`]));

    // The redemption lands in the audit/uniqueness table.
    const redemption = sql.calls.find((q) =>
      q.text.includes("INSERT INTO code_redemptions")
    )!;
    expect(redemption.values).toEqual([CODE, USER]);
    expect(sql.ended).toBe(true);
  });

  it("unknown/expired/disabled/exhausted all collapse to the same generic 400", async () => {
    // The single conditional UPDATE is the only liveness check, so every dead-code
    // flavour looks identical: the claim returns no row.
    sql.onQuery(/INSERT INTO request_counters/, () => [{ count: 1 }]);
    sql.onQuery(/UPDATE redemption_codes/, () => []);
    const res = await redeem(CODE);
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).code).toBe("code_invalid");
    // No grant, no redemption row.
    expect(sql.calls.some((q) => q.text.includes("INSERT INTO tier_grants"))).toBe(false);
    expect(sql.calls.some((q) => q.text.includes("INSERT INTO code_redemptions"))).toBe(false);
  });

  it("malformed input gets the same generic 400 without touching the code tables", async () => {
    sql.onQuery(/INSERT INTO request_counters/, () => [{ count: 1 }]);
    const res = await redeem("not-a-code-0O1I");
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).code).toBe("code_invalid");
    expect(sql.calls.some((q) => q.text.includes("redemption_codes"))).toBe(false);
  });

  it("double redeem by the same account is a distinct 409 and burns no use", async () => {
    sql.onQuery(/INSERT INTO request_counters/, () => [{ count: 2 }]);
    sql.onQuery(/FROM code_redemptions/, () => [{ present: 1 }]);
    const res = await redeem(CODE);
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).code).toBe("already_redeemed");
    expect(sql.calls.some((q) => q.text.includes("UPDATE redemption_codes"))).toBe(false);
  });

  it("a same-user concurrent double submit (PK violation) maps to the 409 too", async () => {
    // First matching handler wins, so the override registers BEFORE the defaults.
    sql.onQuery(/INSERT INTO code_redemptions/, () => {
      const err = new Error("duplicate key") as Error & { code: string };
      err.code = "23505";
      throw err;
    });
    stubHappyPath();
    const res = await redeem(CODE);
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).code).toBe("already_redeemed");
  });

  it("rate limit fires after the daily allowance and skips the code tables", async () => {
    sql.onQuery(/INSERT INTO request_counters/, () => [{ count: 11 }]);
    const res = await redeem(CODE);
    expect(res.status).toBe(429);
    expect(((await res.json()) as any).code).toBe("rate_limited");
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(sql.calls.some((q) => q.text.includes("redemption_codes"))).toBe(false);
  });

  it("counts attempts in the 'redeem-code' bucket", async () => {
    stubHappyPath();
    await redeem(CODE);
    const counter = sql.calls.find((q) => q.text.includes("request_counters"))!;
    expect(counter.values).toEqual(expect.arrayContaining([USER, "redeem-code"]));
  });

  it("fails CLOSED when the attempt counter errors (unlike the fail-open AI limiter)", async () => {
    sql.onQuery(/INSERT INTO request_counters/, () => {
      throw new Error("counter table missing");
    });
    const res = await redeem(CODE);
    expect(res.status).toBe(503);
    expect(((await res.json()) as any).code).toBe("redeem_unavailable");
    expect(sql.calls.some((q) => q.text.includes("redemption_codes"))).toBe(false);
  });

  it("returns 500 (after rollback) on an unexpected DB error inside the transaction", async () => {
    // First matching handler wins, so the override registers BEFORE the defaults.
    sql.onQuery(/INSERT INTO tier_grants/, () => {
      throw new Error("boom");
    });
    stubHappyPath();
    const res = await redeem(CODE);
    expect(res.status).toBe(500);
  });
});

describe("getEffectiveTier", () => {
  it("resolves plain 'free' when there is no base row and no grant", async () => {
    const result = await getEffectiveTier(sql as never, USER);
    expect(result).toEqual({
      tier: "free",
      baseTier: "free",
      baseUpdatedAt: null,
      grantExpiresAt: null,
    });
  });

  it("only counts ACTIVE grants: the query filters lapsed rows in SQL", async () => {
    await getEffectiveTier(sql as never, USER);
    const q = sql.lastCall()!;
    expect(q.text).toContain("FROM account_tiers");
    expect(q.text).toContain("FROM tier_grants");
    expect(q.text).toContain("expires_at > now()");
  });

  it("an active grant raises a free base and carries its expiry", async () => {
    sql.onQuery(/FROM account_tiers/, () => [
      { src: "grant", tier: "member", ts: "2026-08-06T12:00:00.000Z" },
    ]);
    const result = await getEffectiveTier(sql as never, USER);
    expect(result.tier).toBe("member");
    expect(result.baseTier).toBe("free");
    expect(result.grantExpiresAt).toBe("2026-08-06T12:00:00.000Z");
  });

  it("a lapsed grant simply stops counting (SQL returns only the base row)", async () => {
    sql.onQuery(/FROM account_tiers/, () => [
      { src: "base", tier: "free", ts: "2026-07-01T00:00:00Z" },
    ]);
    const result = await getEffectiveTier(sql as never, USER);
    expect(result.tier).toBe("free");
    expect(result.grantExpiresAt).toBeNull();
  });

  it("never lowers the base tier: premium base + member grant stays premium, untimed", async () => {
    sql.onQuery(/FROM account_tiers/, () => [
      { src: "base", tier: "premium", ts: "2026-07-01T00:00:00Z" },
      { src: "grant", tier: "member", ts: "2026-08-06T12:00:00.000Z" },
    ]);
    const result = await getEffectiveTier(sql as never, USER);
    expect(result.tier).toBe("premium");
    expect(result.grantExpiresAt).toBeNull(); // the stored tier is not time-boxed
  });

  it("picks the furthest expiry among grants at the effective rank", async () => {
    sql.onQuery(/FROM account_tiers/, () => [
      { src: "grant", tier: "member", ts: "2026-08-06T12:00:00.000Z" },
      { src: "grant", tier: "member", ts: "2026-09-01T00:00:00.000Z" },
      { src: "grant", tier: "member", ts: new Date("2026-08-20T00:00:00.000Z") },
    ]);
    const result = await getEffectiveTier(sql as never, USER);
    expect(result.tier).toBe("member");
    expect(result.grantExpiresAt).toBe("2026-09-01T00:00:00.000Z");
  });
});
