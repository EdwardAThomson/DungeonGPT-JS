/**
 * Path parameter length validation middleware for Hono.
 *
 * Rejects requests where any URL path segment exceeds the maximum
 * allowed length. This prevents excessively long identifiers from
 * being passed to database queries, even though Drizzle ORM
 * parameterizes them safely.
 *
 * Defense-in-depth measure — wastes fewer resources on obviously
 * invalid requests (e.g., a 10KB string as a characterId).
 */
import type { Env } from "../types.js";
import type { Context, Next } from "hono";

/** Maximum allowed length for any single URL path segment. */
const MAX_PARAM_LENGTH = 64;

/**
 * Path parameter length validation middleware.
 *
 * Splits the request path into segments and rejects the request
 * if any segment exceeds MAX_PARAM_LENGTH characters.
 *
 * Applied globally — covers all route parameters (:id, :sessionId, etc.)
 * without needing to enumerate each route individually.
 */
export async function paramLengthMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next,
) {
  const segments = c.req.path.split("/");

  for (const segment of segments) {
    if (segment.length > MAX_PARAM_LENGTH) {
      return c.json(
        {
          error: "Invalid request",
          message: `URL path segment exceeds maximum length of ${String(MAX_PARAM_LENGTH)} characters`,
        },
        400,
      );
    }
  }

  return next();
}
