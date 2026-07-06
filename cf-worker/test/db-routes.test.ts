import { describe, it, expect, vi, beforeEach } from "vitest";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { Hono } from "hono";
import { createFakeSql, type FakeSql } from "./helpers/fakeSql";
import { makeEnv } from "./helpers/env";
import type { Env } from "../src/types";
import type { AuthVariables } from "../src/middleware/auth";

// The postgres seam: db routes construct their client via postgres(connectionString)
// (through getSql). Mocking the `postgres` module hands them the fake instead, so
// queries execute against test-registered handlers and never open a socket.
const pg = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("postgres", () => ({ default: () => pg.current }));

import dbRoutes from "../src/routes/db";

const USER = "user-db-1";

function makeApp() {
  // Stub auth: set the userId the way requireAuth would, then mount the routes.
  const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
  app.use("*", async (c, next) => {
    c.set("userId", USER);
    await next();
  });
  app.route("/", dbRoutes);
  return app;
}

async function call(path: string, init: RequestInit = {}) {
  const ctx = createExecutionContext();
  const res = await makeApp().request(
    path,
    {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    },
    makeEnv(),
    ctx
  );
  await waitOnExecutionContext(ctx);
  return res;
}

let sql: FakeSql;

beforeEach(() => {
  sql = createFakeSql();
  pg.current = sql;
});

describe("GET /entitlements", () => {
  it("reports 'free' when the account has no tier row", async () => {
    const res = await call("/entitlements");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tier: "free", updatedAt: null });
    expect(sql.lastCall()?.values).toContain(USER);
    expect(sql.ended).toBe(true);
  });

  it("reports the stored tier when a row exists", async () => {
    sql.onQuery(/FROM account_tiers/, () => [
      { tier: "member", updated_at: "2026-07-01T00:00:00Z" },
    ]);
    const res = await call("/entitlements");
    expect(await res.json()).toEqual({
      tier: "member",
      updatedAt: "2026-07-01T00:00:00Z",
    });
  });

  it("returns 500 on a DB error", async () => {
    sql.onQuery(/FROM account_tiers/, () => {
      throw new Error("connection refused");
    });
    const res = await call("/entitlements");
    expect(res.status).toBe(500);
    expect(((await res.json()) as any).error).toBe("Failed to fetch entitlements");
  });
});

describe("GET /heroes", () => {
  it("maps snake_case rows to the camelCase API contract", async () => {
    sql.onQuery(/SELECT \* FROM heroes/, () => [
      {
        hero_id: "h1",
        hero_name: "Astrid",
        hero_gender: "female",
        hero_race: "human",
        hero_class: "ranger",
        hero_level: 3,
        hero_background: "outlander",
        hero_alignment: "NG",
        profile_picture: "astrid.png",
        stats: { str: 12 },
      },
    ]);
    const res = await call("/heroes");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        heroId: "h1",
        heroName: "Astrid",
        heroGender: "female",
        heroRace: "human",
        heroClass: "ranger",
        heroLevel: 3,
        heroBackground: "outlander",
        heroAlignment: "NG",
        profilePicture: "astrid.png",
        stats: { str: 12 },
      },
    ]);
  });

  it("scopes the query to the authenticated user", async () => {
    await call("/heroes");
    const q = sql.lastCall()!;
    expect(q.text).toContain("WHERE user_id =");
    expect(q.values).toEqual([USER]);
  });
});

describe("POST /conversations (rev-guarded upsert, migration 003 semantics)", () => {
  const payload = {
    sessionId: "sess-1",
    conversationName: "My save",
    conversation: [{ role: "user", content: "hi" }],
  };

  it("without expectedRev: unconditional upsert, new rows start at rev 1, updates bump rev", async () => {
    sql.onQuery(/INSERT INTO conversations/, (q) => [
      { session_id: "sess-1", rev: 1 },
    ]);
    const res = await call("/conversations", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(201);

    const q = sql.calls.find((c) => c.text.includes("INSERT INTO conversations"))!;
    // Fresh INSERT seeds the lineage counter at 1 (a SQL literal, the last
    // position in the VALUES tuple)...
    expect(q.text).toMatch(/, 1 ?\)/);
    // ...the conflict arm bumps it...
    expect(q.text).toContain("rev = conversations.rev + 1");
    // ...and the unguarded branch has no rev condition.
    expect(q.text).not.toContain("WHERE conversations.rev =");
  });

  it("with expectedRev and a guard hit: applies the update and returns the row", async () => {
    sql.onQuery(/INSERT INTO conversations/, () => [
      { session_id: "sess-1", rev: 3 },
    ]);
    const res = await call("/conversations", {
      method: "POST",
      body: JSON.stringify({ ...payload, expectedRev: 2 }),
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as any).rev).toBe(3);

    const q = sql.calls.find((c) => c.text.includes("INSERT INTO conversations"))!;
    expect(q.text).toContain("WHERE conversations.rev =");
    expect(q.values).toContain(2);
  });

  it("with expectedRev and a guard miss: 409 rev_conflict carrying the current lineage", async () => {
    // Upsert filtered away by the guard -> no row returned.
    sql.onQuery(/INSERT INTO conversations/, () => []);
    sql.onQuery(/SELECT rev, updated_at FROM conversations/, () => [
      { rev: 7, updated_at: "2026-07-06T10:00:00Z" },
    ]);
    const res = await call("/conversations", {
      method: "POST",
      body: JSON.stringify({ ...payload, expectedRev: 2 }),
    });
    expect(res.status).toBe(409);
    const json = (await res.json()) as any;
    expect(json.code).toBe("rev_conflict");
    expect(json.rev).toBe(7);
    expect(json.updated_at).toBe("2026-07-06T10:00:00Z");
  });

  it("non-integer expectedRev is ignored (falls back to the unconditional upsert)", async () => {
    sql.onQuery(/INSERT INTO conversations/, () => [{ session_id: "sess-1", rev: 2 }]);
    const res = await call("/conversations", {
      method: "POST",
      body: JSON.stringify({ ...payload, expectedRev: "2" }),
    });
    expect(res.status).toBe(201);
    const q = sql.calls.find((c) => c.text.includes("INSERT INTO conversations"))!;
    expect(q.text).not.toContain("WHERE conversations.rev =");
  });

  it("returns 500 on a DB error", async () => {
    sql.onQuery(/INSERT INTO conversations/, () => {
      throw new Error("boom");
    });
    const res = await call("/conversations", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    expect(res.status).toBe(500);
  });
});

describe("PUT /conversations/:sessionId (content write)", () => {
  it("bumps rev and scopes to the owner", async () => {
    sql.onQuery(/UPDATE conversations SET/, () => [{ session_id: "s", rev: 4 }]);
    const res = await call("/conversations/sess-9", {
      method: "PUT",
      body: JSON.stringify({ conversation_data: [{ role: "user", content: "x" }] }),
    });
    expect(res.status).toBe(200);
    const q = sql.lastCall()!;
    expect(q.text).toContain("rev = conversations.rev + 1");
    expect(q.text).toContain("AND user_id =");
    expect(q.values).toContain(USER);
    expect(q.values).toContain("sess-9");
  });

  it("404 when the conversation does not exist (or belongs to someone else)", async () => {
    const res = await call("/conversations/missing", {
      method: "PUT",
      body: JSON.stringify({ conversation_data: [] }),
    });
    expect(res.status).toBe(404);
  });
});

describe("PUT /conversations/:sessionId/name (metadata write)", () => {
  it("does NOT bump rev: renames must never 409-fork another device", async () => {
    sql.onQuery(/UPDATE conversations SET/, () => [{ session_id: "s" }]);
    const res = await call("/conversations/sess-9/name", {
      method: "PUT",
      body: JSON.stringify({ conversationName: "Renamed" }),
    });
    expect(res.status).toBe(200);
    const q = sql.lastCall()!;
    expect(q.text).toContain("conversation_name =");
    expect(q.text).not.toContain("rev");
  });
});

describe("GET /premium-templates", () => {
  // Full authored templates as stored: settings/milestones are the protected
  // content and must NEVER appear in a teaser (maintainer 2026-07-06: cards
  // show to everyone as upsell; content stays tier-gated).
  const rows = [
    {
      id: "desert-x",
      min_tier: "member",
      template: {
        id: "desert-x", name: "Desert", subtitle: "The Dunes", tier: 2,
        levelRange: [3, 5], shortDescription: "Sand.", theme: "desert",
        minTier: "member",
        settings: { milestones: [{ id: 1, text: "secret" }], customNames: { towns: ["Hidden"] } },
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

  it("free accounts get TEASERS for everything: card metadata, no content", async () => {
    sql.onQuery(/FROM premium_templates/, () => rows);
    const res = await call("/premium-templates");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { templates: any[] };
    expect(body.templates).toHaveLength(2);
    for (const t of body.templates) {
      expect(t.teaser).toBe(true);
      expect(t.premium).toBe(true);
      expect(t.name).toBeTruthy();
      expect(t.levelRange).toBeTruthy();
      expect(t).not.toHaveProperty("settings");
      expect(JSON.stringify(t)).not.toContain("secret");
      expect(JSON.stringify(t)).not.toContain("Hidden");
    }
    expect(body.templates.map((t) => t.minTier)).toEqual(["member", "premium"]);
  });

  it("members get full covered rows and teasers above", async () => {
    sql.onQuery(/FROM account_tiers/, () => [{ tier: "member" }]);
    sql.onQuery(/FROM premium_templates/, () => rows);
    const body = (await (await call("/premium-templates")).json()) as { templates: any[] };
    expect(body.templates[0].settings.milestones).toHaveLength(1); // full
    expect(body.templates[0].teaser).toBeUndefined();
    expect(body.templates[1].teaser).toBe(true); // premium row teased
    expect(body.templates[1]).not.toHaveProperty("settings");
  });

  it("delivers everything full at elite", async () => {
    sql.onQuery(/FROM account_tiers/, () => [{ tier: "elite" }]);
    sql.onQuery(/FROM premium_templates/, () => rows);
    const body = (await (await call("/premium-templates")).json()) as { templates: any[] };
    expect(body.templates.every((t) => !t.teaser && t.settings)).toBe(true);
  });
});
