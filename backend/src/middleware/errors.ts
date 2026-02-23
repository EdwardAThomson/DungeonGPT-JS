/**
 * Global error handler middleware for Hono.
 *
 * Catches unhandled errors and returns structured error responses.
 * Never leaks stack traces or internal details to the client.
 */
import type { Env } from "../types.js";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Structured error response shape.
 * Matches the errorResponseSchema from @dungeongpt/shared.
 */
interface ErrorResponseBody {
  error: string;
  message?: string;
}

/**
 * Global onError handler for the Hono app.
 * Logs the full error server-side, returns a generic message to the client.
 */
export function onErrorHandler(
  error: Error,
  c: Context<{ Bindings: Env }>,
): Response {
  const status = getStatusFromError(error);

  // Log full error details server-side only
  console.error(
    JSON.stringify({
      type: "unhandled_error",
      message: error.message,
      path: c.req.path,
      method: c.req.method,
      timestamp: new Date().toISOString(),
    }),
  );

  const body: ErrorResponseBody = {
    error: status >= 500 ? "Internal server error" : error.message,
  };

  return c.json(body, status);
}

/**
 * Global 404 handler for unmatched routes.
 */
export function onNotFoundHandler(c: Context<{ Bindings: Env }>): Response {
  return c.json({ error: "Not found" }, 404);
}

/**
 * Derive HTTP status code from an error.
 * Default to 500 for unknown errors.
 * Clamps to valid contentful status code range (200-599).
 */
function getStatusFromError(error: Error): ContentfulStatusCode {
  if ("status" in error && typeof error.status === "number") {
    const s = error.status;
    // Ensure the status is a valid contentful HTTP status code (200-599)
    if (s >= 200 && s < 600) {
      return s as ContentfulStatusCode;
    }
  }
  return 500;
}
