/**
 * Rate limiting middleware for Hono.
 *
 * Implements a per-IP sliding window rate limiter for the AI generation
 * endpoints. Returns 429 Too Many Requests with a Retry-After header
 * when the limit is exceeded.
 *
 * IMPORTANT: Cloudflare Workers are stateless — each Worker isolate has
 * its own memory, and isolates are recycled frequently. This means the
 * in-memory rate limit state does NOT persist across isolate restarts or
 * across different edge locations. It provides per-isolate burst protection
 * only. For durable, globally consistent rate limiting, use Cloudflare's
 * Rate Limiting rules in the dashboard or a Durable Object-based approach.
 *
 * Despite this limitation, in-memory rate limiting still provides value:
 *  - Limits burst abuse within a single isolate's lifetime
 *  - Prevents tight loops from a single client hitting the same isolate
 *  - Acts as a defense-in-depth layer alongside Cloudflare's DDoS protection
 */
import type { Env } from "../types.js";
import type { Context, Next } from "hono";

// ── Configuration ────────────────────────────────────────────────────────────

/** Maximum number of requests allowed per window. */
const MAX_REQUESTS = 30;

/** Window duration in milliseconds (1 minute). */
const WINDOW_MS = 60_000;

/** Maximum number of IPs to track before pruning. Prevents unbounded memory growth. */
const MAX_TRACKED_IPS = 1000;

// ── State ────────────────────────────────────────────────────────────────────

/**
 * Per-IP request timestamps for the sliding window.
 * Key: IP address, Value: array of request timestamps (ms since epoch).
 *
 * This map lives in the Worker isolate's memory and resets when the
 * isolate is recycled. See module docstring for implications.
 */
const ipRequestLog = new Map<string, number[]>();

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the client IP address from the request.
 * Cloudflare Workers always set CF-Connecting-IP to the true client IP.
 * Falls back to "unknown" if the header is missing (should not happen on CF).
 */
function getClientIp(c: Context<{ Bindings: Env }>): string {
  return c.req.header("cf-connecting-ip") ?? "unknown";
}

/**
 * Prune expired timestamps from the log and evict oldest entries
 * if the map exceeds the maximum tracked IP count.
 */
function pruneIfNeeded(now: number): void {
  if (ipRequestLog.size <= MAX_TRACKED_IPS) {
    return;
  }

  // Remove IPs with no recent requests
  for (const [ip, timestamps] of ipRequestLog) {
    const filtered = timestamps.filter((t) => now - t < WINDOW_MS);
    if (filtered.length === 0) {
      ipRequestLog.delete(ip);
    } else {
      ipRequestLog.set(ip, filtered);
    }
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * Rate limiting middleware for AI generation endpoints.
 *
 * Uses a sliding window algorithm: tracks request timestamps per IP
 * and counts how many fall within the current window. If the count
 * exceeds MAX_REQUESTS, the request is rejected with 429.
 *
 * Apply this middleware to `/api/ai/*` routes only.
 */
export async function rateLimitMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next,
) {
  const now = Date.now();
  const ip = getClientIp(c);

  // Prune stale entries to prevent unbounded memory growth
  pruneIfNeeded(now);

  // Get or initialize the timestamp log for this IP
  const timestamps = ipRequestLog.get(ip) ?? [];

  // Filter to only timestamps within the current window
  const recentTimestamps = timestamps.filter((t) => now - t < WINDOW_MS);

  if (recentTimestamps.length >= MAX_REQUESTS) {
    // Calculate when the oldest request in the window expires
    const oldestInWindow = recentTimestamps[0];
    const retryAfterMs =
      oldestInWindow === undefined ? 0 : WINDOW_MS - (now - oldestInWindow);
    const retryAfterSeconds = Math.ceil(Math.max(retryAfterMs, 1000) / 1000);

    return c.json(
      {
        error: "Too many requests",
        message: `Rate limit exceeded. Maximum ${String(MAX_REQUESTS)} requests per minute.`,
      },
      429 as const,
      {
        "Retry-After": String(retryAfterSeconds),
      },
    );
  }

  // Record this request and update the log
  recentTimestamps.push(now);
  ipRequestLog.set(ip, recentTimestamps);

  return next();
}
