import { Hono } from 'hono';
import type { Env } from '../types';
import { requireAuth, type AuthVariables } from '../middleware/auth';
import { getSql } from '../services/pg';
import { getEffectiveTier, tierRank, TIER_LADDER, type EffectiveTier } from '../services/tiers';
import {
  getHubEntitlements,
  hubTierToGameTier,
  freeHubEntitlements,
} from '../services/hubEntitlements';

// GET /api/entitlements — the logged-in client's own entitlements snapshot
// (hub payments Phase 1; docs/payments-spec.md "Game consumption contract").
//
// Combines TWO sources, and reports the higher rung:
//   1. The Octonion hub (services/hubEntitlements.ts): the billing authority
//      going forward. 60 s per-user cache, fail-closed to free.
//   2. The game's own account_tiers + tier_grants (services/tiers.ts): today's
//      manually-granted testers and the shipped redemption-code flow
//      (POST /api/db/redeem-code) both live here. Taking MAX(local, hub) means
//      neither existing grants nor codes regress while billing moves to the hub;
//      once Phase 2 grandfathers testers on the hub the local rows become
//      redundant and this merge can collapse to hub-only.
//
// Both sources fail closed independently: a hub outage leaves local grants
// working, a game-DB outage leaves hub tiers working, and both failing yields
// plain 'free' with a 200 (never a 500: errors must not break free-tier play).
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
  const authHeader = c.req.header('Authorization');
  const jwt = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';

  // ALLOW_UNAUTHENTICATED_DEV bypass: no verified user, nothing to look up.
  if (!userId || !jwt) {
    return c.json({
      tier: 'free',
      updatedAt: null,
      expiresAt: null,
      hub: freeHubEntitlements(),
    });
  }

  // Hub read path: already fail-closed (free shape) inside the helper.
  const hub = await getHubEntitlements(c.env, userId, jwt);

  // Local read path: fail closed to free on DB errors instead of propagating a
  // 500 (the old /api/db/entitlements 500s here; this route must stay usable
  // through a game-DB blip because the hub side may still hold the answer).
  let local: Pick<EffectiveTier, 'tier' | 'baseUpdatedAt' | 'grantExpiresAt'> = {
    tier: 'free',
    baseUpdatedAt: null,
    grantExpiresAt: null,
  };
  const sql = getSql(c.env);
  try {
    local = await getEffectiveTier(sql, userId);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[entitlements] local tier lookup failed, failing closed to free: ${message}`);
  } finally {
    c.executionCtx.waitUntil(sql.end());
  }

  const effectiveRank = Math.max(tierRank(local.tier), tierRank(hubTierToGameTier(hub.tier)));

  return c.json({
    tier: TIER_LADDER[effectiveRank],
    updatedAt: local.baseUpdatedAt,
    expiresAt: local.grantExpiresAt,
    hub,
  });
});

export { entitlementsRoutes };
