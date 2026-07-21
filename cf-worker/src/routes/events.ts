import { Hono } from "hono";
import { getSql, type Sql } from "../services/pg";
import { bumpCounter } from "../middleware/rateLimit";
import type { Env } from "../types";

// ─── Anonymous product-analytics ingestion (backlog #86) ─────────────────────
//
// This is the Worker's only unauthenticated route, so the protection stack is
// explicit and layered:
//   1. The global CORS allowlist (index.ts) already rejects requests with a
//      missing or unknown Origin, which is the de-facto browser-origin gate.
//   2. Event names must be on the allowlist below; anything else is dropped.
//   3. anon_id must look like a client-minted id (charset + length), props are
//      capped at 1KB serialized and replaced with {} when over.
//   4. An IP-keyed fixed-window rate limit reuses the request_counters table
//      (the per-user rateLimit middleware can't run here: no auth, no userId).
//      Keys are namespaced "ip:<addr>" so they can never collide with user ids.
//
// Fire-and-forget contract: the endpoint ALWAYS answers 204 and never surfaces
// an error to the client. Telemetry must never break or slow the game; bad or
// over-limit input is silently dropped. Nothing personal is stored: no user id,
// no IP (transient for rate limiting only), just anon_id + event + small props.

const ALLOWED_EVENTS = new Set([
  "app_open",
  "play_click",
  "game_launched",
  "first_action",
  "turn_3",
  "turn_10",
  "ai_gate_shown",
  "ai_gate_signin_click",
  "ai_gate_dismissed",
  "signin_started",
  "signin_completed",
  "landing_section_click",
]);

const ANON_ID_RE = /^[A-Za-z0-9-]{8,64}$/;
const MAX_PROPS_BYTES = 1024;

// 120 events per IP per 5 minutes: a real session fires well under 30.
export const EVENTS_BUCKET = "events-ingest";
const EVENTS_WINDOW_SECONDS = 300;
const EVENTS_IP_LIMIT = 120;

const eventsRoutes = new Hono<{ Bindings: Env }>();

eventsRoutes.post("/", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.body(null, 204);
  }

  const event = typeof body?.event === "string" ? body.event : "";
  const anonId = typeof body?.anonId === "string" ? body.anonId : "";
  if (!ALLOWED_EVENTS.has(event) || !ANON_ID_RE.test(anonId)) {
    return c.body(null, 204);
  }

  let props: Record<string, unknown> =
    body?.props && typeof body.props === "object" && !Array.isArray(body.props)
      ? (body.props as Record<string, unknown>)
      : {};
  try {
    if (JSON.stringify(props).length > MAX_PROPS_BYTES) props = {};
  } catch {
    props = {}; // circular/unserializable props
  }

  let sql: Sql | undefined;
  try {
    sql = getSql(c.env);
    const ip = c.req.header("CF-Connecting-IP") || "unknown";
    const { count } = await bumpCounter(
      sql,
      `ip:${ip}`,
      EVENTS_BUCKET,
      EVENTS_WINDOW_SECONDS
    );
    if (count > EVENTS_IP_LIMIT) return c.body(null, 204);

    await sql`
      INSERT INTO app_events (anon_id, event, props)
      VALUES (${anonId}, ${event}, ${sql.json(props)})`;
  } catch (error) {
    // Drop silently towards the client; log for ops.
    console.error(
      "[events] ingest error (event dropped):",
      error instanceof Error ? error.message : error
    );
  } finally {
    if (sql) c.executionCtx.waitUntil(sql.end());
  }

  return c.body(null, 204);
});

export default eventsRoutes;
