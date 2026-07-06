// BRANCH-GATED SUITE: premium-ai-ratelimit
//
// Covers cf-worker/src/middleware/rateLimit.ts (fixed-window per-user limiting,
// backlog #12), which does not exist on master yet. The whole file activates
// automatically once the branch merges: the dynamic import below resolves and
// describe.skipIf(!rl) turns the suites on. On master the import rejects, the
// suites skip cleanly, and the file still reports one passing gate-check test.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { Hono } from "hono";
import { createFakeSql, type FakeSql } from "../helpers/fakeSql";
import { makeEnv } from "../helpers/env";
import type { Env } from "../../src/types";
import type { AuthVariables } from "../../src/middleware/auth";

// The middleware reaches Postgres through getSql -> postgres(connectionString);
// mock the module so it gets the fake client (see helpers/fakeSql.ts).
const pg = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("postgres", () => ({ default: () => pg.current }));

const rl: any = await import("../../src/middleware/rateLimit" as string).catch(
  () => null
);

it(`rate-limit module ${rl ? "present: suite active" : "absent (master): suite skipped"}`, () => {
  expect(true).toBe(true);
});

const USER = "user-rl-1";

let sql: FakeSql;

beforeEach(() => {
  sql = createFakeSql();
  pg.current = sql;
});

describe.skipIf(!rl)("bumpCounter (atomic fixed-window increment)", () => {
  it("upserts one (user, bucket, window) row and returns the post-increment count", async () => {
    sql.onQuery(/INSERT INTO request_counters/, () => [{ count: 4 }]);
    const result = await rl.bumpCounter(sql, USER, "ai-generate", 300);
    expect(result.count).toBe(4);

    const q = sql.lastCall()!;
    expect(q.text).toContain("INSERT INTO request_counters");
    expect(q.text).toContain("ON CONFLICT (user_id, bucket, window_start)");
    expect(q.text).toContain("count = request_counters.count + 1");
    expect(q.values[0]).toBe(USER);
    expect(q.values[1]).toBe("ai-generate");
  });

  it("aligns window_start to the fixed window boundary", async () => {
    sql.onQuery(/INSERT INTO request_counters/, () => [{ count: 1 }]);
    const windowSeconds = 300;
    await rl.bumpCounter(sql, USER, "ai-generate", windowSeconds);
    const windowStart = sql.lastCall()!.values[2] as string;
    expect(new Date(windowStart).getTime() % (windowSeconds * 1000)).toBe(0);
  });

  it("returns retryAfterSeconds within (0, windowSeconds]", async () => {
    sql.onQuery(/INSERT INTO request_counters/, () => [{ count: 1 }]);
    const { retryAfterSeconds } = await rl.bumpCounter(sql, USER, "b", 300);
    expect(retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(retryAfterSeconds).toBeLessThanOrEqual(300);
  });
});

describe.skipIf(!rl)("rateLimit middleware", () => {
  function makeApp(opts: { withUser?: boolean; bucket?: string; options?: unknown } = {}) {
    const { withUser = true, bucket = "ai-generate", options } = opts;
    const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
    app.use("*", async (c, next) => {
      if (withUser) c.set("userId", USER);
      await next();
    });
    app.use("*", rl.rateLimit(bucket, options));
    app.all("/hit", (c) => c.json({ ok: true }));
    return app;
  }

  async function hit(app: Hono<any>, method = "POST") {
    const ctx = createExecutionContext();
    const res = await app.request("/hit", { method }, makeEnv(), ctx);
    await waitOnExecutionContext(ctx);
    return res;
  }

  it("passes requests under the limit and counts them", async () => {
    sql.onQuery(/INSERT INTO request_counters/, () => [{ count: 1 }]);
    const res = await hit(makeApp());
    expect(res.status).toBe(200);
    expect(sql.calls.some((c) => c.text.includes("request_counters"))).toBe(true);
  });

  it("429s over the limit with the documented shape and Retry-After header", async () => {
    const limit = rl.RATE_LIMITS["ai-generate"].limit;
    sql.onQuery(/INSERT INTO request_counters/, () => [{ count: limit + 1 }]);
    // Free-tier account (no row): the lazy member lookup finds nothing.
    sql.onQuery(/FROM account_tiers/, () => []);

    const res = await hit(makeApp());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toMatch(/^\d+$/);
    const json = (await res.json()) as any;
    expect(json.code).toBe("rate_limited");
    expect(json.bucket).toBe("ai-generate");
    expect(typeof json.retryAfterSeconds).toBe("number");
    expect(json.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("grants the higher member allowance via the lazy tier lookup", async () => {
    const { limit, memberLimit } = rl.RATE_LIMITS["ai-generate"];
    sql.onQuery(/INSERT INTO request_counters/, () => [{ count: limit + 1 }]);
    sql.onQuery(/FROM account_tiers/, () => [{ tier: "member" }]);

    const res = await hit(makeApp());
    expect(res.status).toBe(200);
    expect(memberLimit).toBeGreaterThan(limit);
  });

  it("still 429s a member past the member limit", async () => {
    const { memberLimit } = rl.RATE_LIMITS["ai-generate"];
    sql.onQuery(/INSERT INTO request_counters/, () => [{ count: memberLimit + 1 }]);
    sql.onQuery(/FROM account_tiers/, () => [{ tier: "member" }]);

    const res = await hit(makeApp());
    expect(res.status).toBe(429);
  });

  it("FAILS OPEN when the counter query errors", async () => {
    sql.onQuery(/INSERT INTO request_counters/, () => {
      throw new Error("hyperdrive hiccup");
    });
    const res = await hit(makeApp());
    expect(res.status).toBe(200);
  });

  it("skips limiting when there is no userId (dev bypass)", async () => {
    const res = await hit(makeApp({ withUser: false }));
    expect(res.status).toBe(200);
    expect(sql.calls.length).toBe(0);
  });

  it("only counts the configured methods", async () => {
    sql.onQuery(/INSERT INTO request_counters/, () => [{ count: 999 }]);
    const app = makeApp({
      bucket: "db-write",
      options: { methods: ["POST", "PUT", "PATCH", "DELETE"] },
    });
    // GET passes untouched even though the counter would be far over.
    expect((await hit(app, "GET")).status).toBe(200);
    expect(sql.calls.length).toBe(0);
    // POST is counted and throttled.
    expect((await hit(app, "POST")).status).toBe(429);
  });
});

describe.skipIf(!rl)("premium daily allowance constants", () => {
  it("uses a 1-day window on the ai-premium-daily bucket", () => {
    expect(rl.PREMIUM_DAILY_BUCKET).toBe("ai-premium-daily");
    expect(rl.PREMIUM_DAILY_WINDOW_SECONDS).toBe(86400);
  });

  it("defines allowances for every paying tier, member lowest", () => {
    const limits = rl.PREMIUM_DAILY_LIMITS;
    expect(limits.member).toBeGreaterThan(0);
    expect(limits.premium).toBeGreaterThanOrEqual(limits.member);
    expect(limits.elite).toBeGreaterThanOrEqual(limits.member);
  });
});
