import type { Sql } from './pg';

// Tier ladder, lowest first (mirror of src/game/entitlements.js TIER_LADDER; the
// account_tiers CHECK constraint pins the same four values). Unknown/missing tiers
// rank as 'free' (0): fail closed.
//
// Shared by routes/db.ts (premium-templates delivery), routes/ai.ts (premium AI pool
// gate, backlog #7) and middleware/rateLimit.ts (member-tier request allowances).
export const TIER_LADDER = ['free', 'member', 'premium', 'elite'] as const;
export type Tier = (typeof TIER_LADDER)[number];

export const tierRank = (tier: unknown): number =>
  Math.max(TIER_LADDER.indexOf(tier as Tier), 0);

/** ISO-normalize a timestamptz value (postgres.js returns Date; fakes may return strings). */
function toIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' && value ? value : null;
}

export interface EffectiveTier {
  /** MAX rank of the base account_tiers row and every unexpired tier_grants row. */
  tier: string;
  /** The stored account_tiers row ('free' when there is none). */
  baseTier: string;
  /** account_tiers.updated_at, null when there is no base row. */
  baseUpdatedAt: string | null;
  /**
   * When the EFFECTIVE tier comes from a grant (its rank beats the base row):
   * the latest expiry among active grants at that rank. Null when the base tier
   * already covers the effective tier: a stored tier is not time-boxed.
   */
  grantExpiresAt: string | null;
}

/**
 * Effective tier = base account_tiers row MAX active tier_grants rows
 * (redemption codes, backlog #6 first slice; migrations/006_redemption_codes.sql).
 *
 * Expiry is passive: the query simply skips grants with expires_at <= now(); nothing
 * is ever deleted. A lapsed grant stops counting and the effective tier settles back
 * to whatever else still holds. Grandfathering is unaffected: tiers gate creation,
 * never play, so a lapsed member keeps every world they made.
 *
 * One round trip (UNION ALL of two PK/index lookups). No rows means plain 'free',
 * same contract as before. Throws on DB errors; callers decide their own failure
 * posture (the rate limiter fails open, the premium AI gate falls back to the free
 * pool), which also covers the window where migration 006 is not applied yet.
 */
export async function getEffectiveTier(sql: Sql, userId: string): Promise<EffectiveTier> {
  const rows = (await sql`
    SELECT 'base' AS src, tier, updated_at AS ts FROM account_tiers
    WHERE user_id = ${userId}
    UNION ALL
    SELECT 'grant' AS src, tier, expires_at AS ts FROM tier_grants
    WHERE user_id = ${userId} AND expires_at > now()`) as Array<{
    src?: string;
    tier?: unknown;
    ts?: unknown;
  }>;

  let baseTier = 'free';
  let baseUpdatedAt: string | null = null;
  let effectiveRank = 0;
  for (const row of rows) {
    const rank = tierRank(row.tier);
    if (rank > effectiveRank) effectiveRank = rank;
    if (row.src !== 'grant' && typeof row.tier === 'string') {
      baseTier = row.tier;
      baseUpdatedAt = toIso(row.ts);
    }
  }

  // A grant can raise the effective tier, never lower it below the base row.
  let grantExpiresAt: string | null = null;
  if (effectiveRank > tierRank(baseTier)) {
    for (const row of rows) {
      if (row.src !== 'grant' || tierRank(row.tier) !== effectiveRank) continue;
      const iso = toIso(row.ts);
      if (iso && (!grantExpiresAt || iso > grantExpiresAt)) grantExpiresAt = iso;
    }
  }

  return {
    tier: TIER_LADDER[effectiveRank],
    baseTier,
    baseUpdatedAt,
    grantExpiresAt,
  };
}

/**
 * The caller's EFFECTIVE tier (base row raised by any active redemption-code grant).
 * No rows means the account has never been granted anything, which is plain 'free'
 * (same contract as GET /api/db/entitlements). Throws on DB errors; callers decide
 * their own failure posture (the rate limiter fails open, the premium AI gate falls
 * back to the free pool).
 */
export async function getAccountTier(sql: Sql, userId: string): Promise<string> {
  return (await getEffectiveTier(sql, userId)).tier;
}
