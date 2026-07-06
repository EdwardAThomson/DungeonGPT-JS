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

/**
 * The caller's stored account tier. No row means the account has never been granted
 * anything, which is plain 'free' (same contract as GET /api/db/entitlements).
 * Throws on DB errors; callers decide their own failure posture (the rate limiter
 * fails open, the premium AI gate falls back to the free pool).
 */
export async function getAccountTier(sql: Sql, userId: string): Promise<string> {
  const [row] = await sql`
    SELECT tier FROM account_tiers
    WHERE user_id = ${userId}
    LIMIT 1`;
  return typeof row?.tier === 'string' ? row.tier : 'free';
}
