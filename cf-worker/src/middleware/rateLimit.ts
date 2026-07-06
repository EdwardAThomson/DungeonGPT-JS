import type { Context, Next } from 'hono';
import { getSql, type Sql } from '../services/pg';
import { getAccountTier, tierRank } from '../services/tiers';
import type { Env } from '../types';
import type { AuthVariables } from './auth';

// ─── Fixed-window rate limiting (backlog #12) ─────────────────────────────────
//
// Mechanics: one counter row per (user, bucket, aligned window) in the
// request_counters table (migrations/005_request_counters.sql, applied manually
// via psql BEFORE deploy; see the migration header for the runbook + cleanup cron).
// Each counted request does a single atomic upsert-increment RETURNING the new
// count: one DB round trip, race-free under concurrency. Fixed windows mean the
// worst boundary burst is 2x the limit; fine for abuse throttling, and billing-grade
// accounting stays backlog #6's job.
//
// FAIL-OPEN posture: any error in the counter path (Hyperdrive unconfigured, table
// missing, network blip) logs loudly and lets the request through. Availability
// beats strictness here; a DB hiccup must never take AI generation down with it.
//
// Ordering: rateLimit() middleware must run AFTER requireAuth, because it keys on
// the authenticated userId. When there is no userId (the explicit
// ALLOW_UNAUTHENTICATED_DEV bypass in local dev), limiting is skipped.

/**
 * Buckets and limits. `limit` applies to everyone; `memberLimit`, when present,
 * is the higher allowance for member-tier-and-above accounts. The tier lookup is
 * lazy: it only happens once a user has already burned past the free limit inside
 * the current window, so the common path stays a single DB round trip.
 *
 * Chosen numbers (5-minute windows):
 *   ai-generate  30 free / 60 member+   AI turns are human-paced; 30 per 5 min is
 *                                       one turn every 10 seconds, far above real
 *                                       play, low enough to stop scripted spam of
 *                                       the Workers AI budget.
 *   embed        60                     RAG sync embeds in batches; 60 covers a
 *                                       full session backfill without opening the
 *                                       door to bulk-embedding abuse.
 *   db-write     120                    Saves, hero edits, renames. Autosave plus
 *                                       manual saves stay far under this; 120 stops
 *                                       write floods without ever touching normal
 *                                       play.
 *
 * db-read is deliberately UNTHROTTLED: reads are cheap, sign-in fetches
 * (entitlements, premium-templates, saves list) must stay snappy, and a counter
 * upsert per read would roughly double the DB cost of every read. Revisit only if
 * read abuse actually shows up.
 */
export const RATE_LIMITS = {
  'ai-generate': { windowSeconds: 300, limit: 30, memberLimit: 60 },
  embed: { windowSeconds: 300, limit: 60 },
  'db-write': { windowSeconds: 300, limit: 120 },
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

/**
 * Daily premium AI allowance (backlog #7), same counter table, 1-day window.
 * Keyed by tier: members get 200 premium generations per UTC day, premium/elite 500.
 * Over-allowance premium requests get 429 { code: 'premium_cap' } from routes/ai.ts
 * and the client quietly falls back to the free pool, so play never stops.
 */
export const PREMIUM_DAILY_BUCKET = 'ai-premium-daily';
export const PREMIUM_DAILY_WINDOW_SECONDS = 86400;
// Calibrated 2026-07-06 against worst-case cost math (see CF_WORKER_GUIDE):
// with the 8k-token input and 800-token output caps, a maxed member day costs
// roughly $1.40 on the Haiku 4.5 default: bounded even if every member maxes
// out every day. Revisit with real usage telemetry and #6 billing.
export const PREMIUM_DAILY_LIMITS: Record<string, number> = {
  member: 100,
  premium: 200,
  elite: 300,
};

// Monthly allowance: the cap that actually aligns with subscription revenue
// (maintainer 2026-07-06: a daily cap alone lets a $5 member spend $40+ a
// month at the ceiling). With the gpt-5-mini default (~$0.0036 worst-case per
// generation at the 8k-in/800-out clamps), the worst-case monthly spends are
// member ~$2.90, premium ~$7.20, elite ~$14.40 against $5/$10/$20 revenue.
// Daily caps above remain as burst protection within the month.
export const PREMIUM_MONTHLY_BUCKET = 'ai-premium-monthly';
export const PREMIUM_MONTHLY_WINDOW_SECONDS = 30 * 86400;
export const PREMIUM_MONTHLY_LIMITS: Record<string, number> = {
  member: 800,
  premium: 2000,
  elite: 4000,
};

export interface CounterResult {
  count: number;
  retryAfterSeconds: number;
}

/**
 * Atomic fixed-window increment: insert-or-increment the (user, bucket, window)
 * row and return the post-increment count, in one round trip. Also returns the
 * seconds until the window rolls over (the Retry-After value for a 429).
 * Over-limit requests still increment; that is standard fixed-window behaviour
 * and keeps the statement branch-free.
 */
export async function bumpCounter(
  sql: Sql,
  userId: string,
  bucket: string,
  windowSeconds: number
): Promise<CounterResult> {
  const windowMs = windowSeconds * 1000;
  const now = Date.now();
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs).toISOString();

  const [row] = await sql`
    INSERT INTO request_counters (user_id, bucket, window_start, count)
    VALUES (${userId}, ${bucket}, ${windowStart}, 1)
    ON CONFLICT (user_id, bucket, window_start)
      DO UPDATE SET count = request_counters.count + 1
    RETURNING count`;

  return {
    count: Number(row?.count ?? 0),
    retryAfterSeconds: Math.max(1, Math.ceil((windowStartMs + windowMs - now) / 1000)),
  };
}

interface RateLimitOptions {
  /** Only count these HTTP methods; others pass straight through (e.g. mutating-only db-write). */
  methods?: readonly string[];
}

/**
 * Hono middleware factory: fixed-window per-user limiting for one bucket.
 * 429 body: { error, code: 'rate_limited', bucket, retryAfterSeconds } plus a
 * Retry-After header. Must be mounted after requireAuth.
 */
export function rateLimit(bucket: RateLimitBucket, options?: RateLimitOptions) {
  const config = RATE_LIMITS[bucket];

  return async (
    c: Context<{ Bindings: Env; Variables: AuthVariables }>,
    next: Next
  ): Promise<Response | void> => {
    if (options?.methods && !options.methods.includes(c.req.method)) {
      return next();
    }

    const userId = c.get('userId');
    if (!userId) {
      // Only reachable via the explicit ALLOW_UNAUTHENTICATED_DEV bypass; nothing
      // sane to key a counter on, so local dev is unthrottled.
      return next();
    }

    let sql: Sql | undefined;
    try {
      sql = getSql(c.env);
      const { count, retryAfterSeconds } = await bumpCounter(
        sql,
        userId,
        bucket,
        config.windowSeconds
      );

      let limit: number = config.limit;
      if (count > limit && 'memberLimit' in config && config.memberLimit > limit) {
        // Lazy tier lookup: only users already past the free allowance pay for it.
        const tier = await getAccountTier(sql, userId);
        if (tierRank(tier) >= tierRank('member')) {
          limit = config.memberLimit;
        }
      }

      if (count > limit) {
        console.warn(
          `[rateLimit] ${bucket} limit hit: user=${userId} count=${count} limit=${limit}`
        );
        c.header('Retry-After', String(retryAfterSeconds));
        return c.json(
          {
            error: 'Rate limit exceeded',
            code: 'rate_limited',
            bucket,
            retryAfterSeconds,
          },
          429
        );
      }
    } catch (error) {
      // FAIL OPEN: log loudly, let the request through (see posture note above).
      console.error(
        `[rateLimit] counter error for bucket=${bucket}; FAILING OPEN:`,
        error instanceof Error ? error.message : error
      );
    } finally {
      if (sql) c.executionCtx.waitUntil(sql.end());
    }

    return next();
  };
}
