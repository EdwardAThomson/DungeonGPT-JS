import type { Env } from '../types';
import type { Tier } from './tiers';

// Hub entitlements read path (hub payments Phase 1; octonion-io-website
// docs/payments-spec.md "Game consumption contract").
//
// The Octonion hub is becoming the single billing authority: a user subscribes at
// octonion.io and every game reads `{ tier, status, credits }` from the hub's
// GET /api/me/entitlements, forwarding the user's hub JWT (which this Worker
// already receives and verifies on every request; middleware/auth.ts).
//
// Contract highlights:
//   - 60 s in-memory cache PER USER, same module-level pattern as the JWKS key
//     cache in middleware/auth.ts (per-isolate Map, cold starts begin empty).
//     Keyed by userId, never by JWT string: a token refresh must hit the cache.
//   - FAIL CLOSED: any failure (network, timeout, non-200, invalid JSON, unknown
//     tier) resolves to the free-tier shape. Errors may deny a premium feature,
//     they must never break free-tier functionality. Failures are NOT cached, so
//     a hub blip re-resolves on the next call instead of pinning free for 60 s.
//   - Short fetch timeout (3 s) so a slow hub can never stall game requests.
//
// Phase 1 only READS (the /api/entitlements route below feeds the client's UX
// gates). Phase 3 server enforcement (premium AI pool 403, premium content
// delivery) will call getHubEntitlements from those routes and mirror the same
// tier mapping; no enforcement is wired here yet.

// ── Hub tier -> game tier (the ONE mapping Phase 3 must reuse) ────────────────

// The hub ladder is 'free' | 'members' | 'premium' | 'elite' (account_tiers on the
// hub Supabase). The game ladder (services/tiers.ts TIER_LADDER, the game DB CHECK
// constraint, template minTier values) spells the paid rung 'member'. The rename is
// normalized HERE, at the hub boundary, in exactly one place; everything downstream
// keeps speaking the game ladder. Unknown hub tiers rank as 'free': fail closed.
const HUB_TIER_TO_GAME_TIER: Record<string, Tier> = {
  free: 'free',
  members: 'member',
  premium: 'premium',
  elite: 'elite',
};

/** Map a hub tier value onto the game's TIER_LADDER; unknown values fail closed to 'free'. */
export function hubTierToGameTier(hubTier: unknown): Tier {
  return (typeof hubTier === 'string' && HUB_TIER_TO_GAME_TIER[hubTier]) || 'free';
}

// ── Types ─────────────────────────────────────────────────────────────────────

/** Snapshot returned by the hub's GET /api/me/entitlements. */
export interface HubEntitlements {
  /** Hub ladder value: 'free' | 'members' | 'premium' | 'elite'. */
  tier: string;
  /** 'active' | 'cancelled' | 'past_due' | 'expired'. */
  status: string;
  /** Founder-style one-time unlock. */
  lifetime: boolean;
  currentPeriodEnd: string | null;
  /** Per-account overrides (content-comp grants). */
  perks: Record<string, unknown>;
  /** { month, balance } once the credit ledger ships (Phase 2+); null in Phase 1. */
  credits: { month: string; balance: number } | null;
}

/** The fail-closed shape: what every error path resolves to. Fresh object per call. */
export function freeHubEntitlements(): HubEntitlements {
  return {
    tier: 'free',
    status: 'active',
    lifetime: false,
    currentPeriodEnd: null,
    perks: {},
    credits: null,
  };
}

// ── Per-user cache (same pattern as the JWKS keyCache in middleware/auth.ts) ──

// Module-level cache persists across requests within the same worker isolate.
// Each isolate starts fresh on cold start (acceptable: one 60 s-amortized fetch).
const HUB_ENTITLEMENTS_TTL_MS = 60 * 1000; // bounds revocation latency at a minute
const HUB_FETCH_TIMEOUT_MS = 3 * 1000; // a slow hub must never stall game requests

export const DEFAULT_HUB_URL = 'https://octonion.io';

interface CachedEntitlements {
  value: HubEntitlements;
  cachedAt: number;
}

const entitlementsCache = new Map<string, CachedEntitlements>();

// ── Fetch + normalize ─────────────────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Coerce the hub's JSON into a HubEntitlements, or null when the payload is not
 * usable (not an object, unknown tier). Field-level sloppiness degrades softly:
 * a missing status/perks/credits gets the free-shape default, but the tier itself
 * must be a known hub ladder value or the whole snapshot is rejected (fail closed).
 */
function normalizeHubEntitlements(data: unknown): HubEntitlements | null {
  if (!isPlainObject(data)) return null;
  if (typeof data.tier !== 'string' || !(data.tier in HUB_TIER_TO_GAME_TIER)) return null;

  const credits = isPlainObject(data.credits)
    ? {
        month: typeof data.credits.month === 'string' ? data.credits.month : '',
        balance: typeof data.credits.balance === 'number' ? data.credits.balance : 0,
      }
    : null;

  return {
    tier: data.tier,
    status: typeof data.status === 'string' ? data.status : 'active',
    lifetime: data.lifetime === true,
    currentPeriodEnd:
      typeof data.currentPeriodEnd === 'string' ? data.currentPeriodEnd : null,
    perks: isPlainObject(data.perks) ? data.perks : {},
    credits,
  };
}

/** One hub round trip; null on ANY failure (callers fail closed to free). */
async function fetchHubEntitlements(
  env: Env,
  jwt: string
): Promise<HubEntitlements | null> {
  const base = (env.HUB_URL || DEFAULT_HUB_URL).replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HUB_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${base}/api/me/entitlements`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`hub responded HTTP ${response.status}`);
    }
    const normalized = normalizeHubEntitlements(await response.json());
    if (!normalized) {
      throw new Error('hub returned an unusable entitlements payload');
    }
    return normalized;
  } catch (err) {
    // Fail closed, loudly: free-tier play must keep working through any hub outage.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[hub-entitlements] resolve failed, failing closed to free: ${message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve the user's hub entitlements, cached per user for 60 s.
 *
 * `jwt` is the caller's already-verified hub JWT (requireAuth ran first); it is
 * forwarded to the hub as the Bearer credential, so the hub applies its own auth.
 * Any failure returns the free-tier shape and skips the cache.
 */
export async function getHubEntitlements(
  env: Env,
  userId: string,
  jwt: string
): Promise<HubEntitlements> {
  const cached = entitlementsCache.get(userId);
  const now = Date.now();
  if (cached && now - cached.cachedAt < HUB_ENTITLEMENTS_TTL_MS) {
    return cached.value;
  }

  const fetched = await fetchHubEntitlements(env, jwt);
  if (!fetched) return freeHubEntitlements();

  entitlementsCache.set(userId, { value: fetched, cachedAt: now });
  return fetched;
}
