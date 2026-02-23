/**
 * Payload size limit middleware for Hono.
 *
 * Rejects request bodies that exceed a configured byte limit.
 * Prevents resource exhaustion from oversized payloads.
 *
 * Limits:
 *  - Conversation saves (POST/PUT /api/conversations): 1 MB
 *  - AI generation (POST /api/ai): 1 MB (prompts include conversation context)
 *  - All other endpoints: 10 KB
 */
import type { Env } from "../types.js";
import type { Context, Next } from "hono";

// ── Size Limits ─────────────────────────────────────────────────────────────

/** 1 MB in bytes — for conversation saves and AI prompts. */
const LARGE_PAYLOAD_LIMIT = 1_048_576;

/** 10 KB in bytes — for all other endpoints (character CRUD, etc.). */
const DEFAULT_LIMIT = 10_240;

/**
 * Determine the payload limit for a given request path.
 * Conversation save and AI generation endpoints get a larger limit.
 */
function getLimitForPath(path: string): number {
  if (path.startsWith("/api/conversations")) {
    return LARGE_PAYLOAD_LIMIT;
  }

  if (path.startsWith("/api/ai")) {
    return LARGE_PAYLOAD_LIMIT;
  }

  return DEFAULT_LIMIT;
}

/**
 * Payload size limit middleware.
 *
 * Reads the Content-Length header to reject obviously oversized requests
 * before consuming the body.
 *
 * Only applies to methods that carry a request body (POST, PUT, PATCH).
 */
export async function payloadLimitMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next,
) {
  const method = c.req.method;

  // Only check methods that carry a body
  if (method !== "POST" && method !== "PUT" && method !== "PATCH") {
    return next();
  }

  const limit = getLimitForPath(c.req.path);
  const contentLength = c.req.header("content-length");

  // Fast rejection via Content-Length header if present
  if (contentLength) {
    const size = Number.parseInt(contentLength, 10);
    if (!Number.isNaN(size) && size > limit) {
      return c.json(
        {
          error: "Payload too large",
          message: `Request body exceeds ${String(limit)} bytes`,
        },
        413,
      );
    }
  }

  return next();
}
