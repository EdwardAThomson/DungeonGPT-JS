import { describe, it, expect, vi, beforeEach } from "vitest";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { Hono } from "hono";
import { createFakeSql, type FakeSql } from "./helpers/fakeSql";
import { makeEnv } from "./helpers/env";
import type { Env } from "../src/types";

const pg = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("postgres", () => ({ default: () => pg.current }));

import eventsRoutes from "../src/routes/events";

function makeApp() {
  // Mounted WITHOUT auth on purpose: that is the route's contract.
  const app = new Hono<{ Bindings: Env }>();
  app.route("/", eventsRoutes);
  return app;
}

async function post(body: unknown, headers: Record<string, string> = {}) {
  const ctx = createExecutionContext();
  const res = await makeApp().request(
    "/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
    makeEnv(),
    ctx
  );
  await waitOnExecutionContext(ctx);
  return res;
}

const ANON = "11111111-2222-3333-4444-555555555555";

let sql: FakeSql;
let counterCount: number;

beforeEach(() => {
  sql = createFakeSql();
  counterCount = 1;
  // The IP rate-limit counter upsert; returns the configurable running count.
  sql.onQuery(/INSERT INTO request_counters/i, () => [{ count: counterCount }]);
  pg.current = sql;
});

const insertedEvents = () =>
  sql.calls.filter((c) => /INSERT INTO app_events/i.test(c.text));

describe("POST /api/events", () => {
  it("ingests an allowlisted event and answers 204", async () => {
    const res = await post({ event: "app_open", anonId: ANON, props: { a: 1 } });
    expect(res.status).toBe(204);
    const inserts = insertedEvents();
    expect(inserts.length).toBe(1);
    expect(inserts[0].values).toContain(ANON);
    expect(inserts[0].values).toContain("app_open");
  });

  it("drops unknown event names silently (204, no insert)", async () => {
    const res = await post({ event: "totally_made_up", anonId: ANON });
    expect(res.status).toBe(204);
    expect(insertedEvents().length).toBe(0);
  });

  it("drops malformed anon ids (injection-shaped or too short)", async () => {
    for (const bad of ["x", "id with spaces", "'; DROP TABLE app_events;--", ""]) {
      const res = await post({ event: "app_open", anonId: bad });
      expect(res.status).toBe(204);
    }
    expect(insertedEvents().length).toBe(0);
  });

  it("replaces oversized props with {} but keeps the event", async () => {
    const res = await post({
      event: "app_open",
      anonId: ANON,
      props: { blob: "x".repeat(5000) },
    });
    expect(res.status).toBe(204);
    const inserts = insertedEvents();
    expect(inserts.length).toBe(1);
    // the 5KB payload never reaches the insert
    expect(JSON.stringify(inserts[0].values)).not.toContain("xxxxx");
  });

  it("drops events over the IP rate limit without erroring", async () => {
    counterCount = 121; // over EVENTS_IP_LIMIT
    const res = await post({ event: "app_open", anonId: ANON });
    expect(res.status).toBe(204);
    expect(insertedEvents().length).toBe(0);
  });

  it("answers 204 even on unparseable bodies", async () => {
    const res = await post("not json at all {{{");
    expect(res.status).toBe(204);
    expect(insertedEvents().length).toBe(0);
  });

  it("answers 204 even when the database is down (fire-and-forget contract)", async () => {
    sql.onQuery(/INSERT INTO app_events/i, () => {
      throw new Error("connection refused");
    });
    const res = await post({ event: "app_open", anonId: ANON });
    expect(res.status).toBe(204);
  });
});
