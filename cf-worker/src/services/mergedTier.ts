import type { Env } from '../types';
import type { Sql } from './pg';
import {
  getEffectiveTier,
  tierRank,
  TIER_LADDER,
  type EffectiveTier,
  type Tier,
} from './tiers';
import {
  getHubEntitlements,
  hubTierToGameTier,
  freeHubEntitlements,
  type HubEntitlements,
} from './hubEntitlements';

// Merged tier resolution (hub payments Phase 3; octonion-io-website
// docs/payments-spec.md "Phased rollout / Phase 3").
//
// THE one shared answer to "what tier is this caller, really?" now that billing
// lives at the Octonion hub: the effective game-ladder tier is
//
//   MAX( local effective tier, hub tier mapped onto the game ladder )
//
// Used by every server-side member/tier admission point (the premium AI pool gate
// in routes/ai.ts, the premium-content delivery in routes/db.ts) and by the
// client-facing snapshot in routes/entitlements.ts, so the enforcement points and
// the UX snapshot can never drift apart.
//
// Resolution order and failure posture:
//   1. LOCAL first (account_tiers + tier_grants, one indexed round trip, no
//      network). A DB error degrades THIS SOURCE to 'free' (logged, never
//      thrown) so the hub side can still admit — mirroring how a hub outage
//      leaves local grants working.
//   2. If the local tier already satisfies `skipHubAtOrAbove`, the hub call is
//      skipped entirely: an admission check that only needs "member or better"
//      never pays the hub round trip for a local member.
//   3. Otherwise the hub is consulted via getHubEntitlements (60 s per-user
//      cache, 3 s timeout, fail-closed to the free shape inside the helper).
//
// This function NEVER throws and can only ever raise a caller's access above
// what a single source would grant — both sources failing yields plain 'free',
// so errors may deny member features but never widen access and never break
// free play.

export interface MergedTier {
  /** Effective game-ladder tier: MAX(local effective tier, mapped hub tier). */
  tier: Tier;
  /** Local source (account_tiers + tier_grants); the free shape when the lookup failed. */
  local: Pick<EffectiveTier, 'tier' | 'baseUpdatedAt' | 'grantExpiresAt'>;
  /**
   * True when the LOCAL lookup threw (degraded to 'free' for that source).
   * Lets a gate distinguish "genuinely free: deny with an upgrade prompt" from
   * "outage: degrade politely" — the AI gate keeps its degrade-to-free-pool
   * posture for outages instead of telling a possibly-paying user to upgrade.
   * (No hub twin for this flag: getHubEntitlements hides failures by design.)
   */
  localErrored: boolean;
  /** Raw hub snapshot; the free shape when the hub was skipped, unreachable, or failed. */
  hub: HubEntitlements;
}

export interface MergedTierAuth {
  /** Verified subject from requireAuth; absent only via the ALLOW_UNAUTHENTICATED_DEV bypass. */
  userId?: string;
  /** The caller's already-verified hub JWT (forwarded to the hub as the Bearer credential). */
  jwt?: string;
}

export interface MergedTierOptions {
  /**
   * When the LOCAL tier already sits at or above this rung, skip the hub call
   * entirely (the merge could only confirm, never change, the admission answer).
   * Omit to always consult the hub (e.g. routes/entitlements.ts, which must
   * report the raw hub snapshot to the client).
   */
  skipHubAtOrAbove?: Tier;
}

/**
 * Resolve the caller's effective game tier as MAX(local, hub). Never throws;
 * each source fails closed to 'free' independently. Without a userId (dev
 * bypass) or a jwt (nothing to present to the hub) the missing source simply
 * resolves free.
 */
export async function getMergedTier(
  env: Env,
  sql: Sql,
  auth: MergedTierAuth,
  options: MergedTierOptions = {}
): Promise<MergedTier> {
  const { userId, jwt } = auth;

  let local: MergedTier['local'] = {
    tier: 'free',
    baseUpdatedAt: null,
    grantExpiresAt: null,
  };
  let localErrored = false;
  if (userId) {
    try {
      local = await getEffectiveTier(sql, userId);
    } catch (error: unknown) {
      localErrored = true;
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[merged-tier] local tier lookup failed, failing closed to free for that source: ${message}`
      );
    }
  }

  const localRank = tierRank(local.tier);
  const skipHub =
    options.skipHubAtOrAbove !== undefined &&
    localRank >= tierRank(options.skipHubAtOrAbove);

  const hub =
    !skipHub && userId && jwt
      ? await getHubEntitlements(env, userId, jwt) // fail-closed inside
      : freeHubEntitlements();

  const effectiveRank = Math.max(localRank, tierRank(hubTierToGameTier(hub.tier)));

  return { tier: TIER_LADDER[effectiveRank], local, localErrored, hub };
}

/** The JWT exactly as requireAuth verified it, for forwarding to the hub. */
export function bearerToken(authorizationHeader: string | undefined): string {
  return authorizationHeader?.startsWith('Bearer ')
    ? authorizationHeader.slice(7)
    : '';
}
