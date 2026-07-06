import postgres from 'postgres';
import type { Env } from '../types';

// One postgres.js client per request, reaching Postgres via Cloudflare Hyperdrive.
// Hyperdrive does the real connection pooling, so a small client-side `max` is fine.
// `fetch_types: false` skips per-query type introspection round-trips (recommended on Workers).
//
// Shared by routes/db.ts, middleware/rateLimit.ts and routes/ai.ts (premium tier gate).
// Callers own the lifecycle: close with `c.executionCtx.waitUntil(sql.end())` in a
// finally block, exactly like the db routes do.
export function getSql(env: Env) {
  if (!env.HYPERDRIVE?.connectionString) {
    throw new Error('Hyperdrive not configured');
  }
  return postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false });
}

export type Sql = ReturnType<typeof getSql>;
