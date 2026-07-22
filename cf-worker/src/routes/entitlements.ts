import { Hono } from 'hono';
import type { Env } from '../types';
import { requireAuth, type AuthVariables } from '../middleware/auth';
import { getSql } from '../services/pg';
import { freeHubEntitlements } from '../services/hubEntitlements';
import { getMergedTier, bearerToken } from '../services/mergedTier';

// GET /api/entitlements — the logged-in client's own entitlements snapshot
// (hub payments Phase 1; docs/payments-spec.md "Game consumption contract").
//
// Combines TWO sources, and reports the higher rung (services/mergedTier.ts,
// the SAME resolver the Phase 3 server enforcement points use, so the client
// snapshot and the server gates can never drift):
//   1. The Octonion hub (services/hubEntitlements.ts): the billing authority
//      going forward. 60 s per-user cache, fail-closed to free.
//   2. The game's own account_tiers + tier_grants (services/tiers.ts): today's
//      manually-granted testers and the shipped redemption-code flow
//      (POST /api/db/redeem-code) both live here. Taking MAX(local, hub) means
//      neither existing grants nor codes regress while billing moves to the hub;
//      once Phase 2 grandfathers testers on the hub the local rows become
//      redundant and this merge can collapse to hub-only.
//
// Both sources fail closed independently (inside getMergedTier): a hub outage
// leaves local grants working, a game-DB outage leaves hub tiers working, and
// both failing yields plain 'free' with a 200 (never a 500: errors must not
// break free-tier play). No skipHubAtOrAbove short-circuit here on purpose:
// this route must always report the raw hub snapshot for display.
//
// Response shape (client: src/services/entitlementsApi.js):
//   { tier, updatedAt, expiresAt, hub }
// `tier` is the effective GAME-ladder tier (free|member|premium|elite);
// updatedAt/expiresAt keep the GET /api/db/entitlements contract (local base-row
// timestamp / local grant expiry); `hub` is the raw hub snapshot for display.
const entitlementsRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// Per-user, mutable data: never let any cache store it (same rationale as the
// no-store middleware on /api/db).
entitlementsRoutes.use('*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
});

// Respond explicitly to CORS preflight for authenticated requests (as routes/ai.ts).
entitlementsRoutes.options('*', (c) => c.body(null, 204));

entitlementsRoutes.get('/', requireAuth, async (c) => {
  const userId = c.get('userId');
  const jwt = bearerToken(c.req.header('Authorization'));

  // ALLOW_UNAUTHENTICATED_DEV bypass: no verified user, nothing to look up.
  if (!userId || !jwt) {
    return c.json({
      tier: 'free',
      updatedAt: null,
      expiresAt: null,
      hub: freeHubEntitlements(),
    });
  }

  // Both sources resolved (and independently failed closed) inside the shared
  // resolver; this route only owns the response shape and the sql lifecycle.
  const sql = getSql(c.env);
  try {
    const merged = await getMergedTier(c.env, sql, { userId, jwt });
    return c.json({
      tier: merged.tier,
      updatedAt: merged.local.baseUpdatedAt,
      expiresAt: merged.local.grantExpiresAt,
      hub: merged.hub,
    });
  } finally {
    c.executionCtx.waitUntil(sql.end());
  }
});

export { entitlementsRoutes };
