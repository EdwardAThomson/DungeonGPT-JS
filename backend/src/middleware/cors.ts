/**
 * CORS middleware for Hono.
 *
 * Explicit origin whitelist — no wildcards.
 * Production: only the frontend Worker domain.
 * Development: also allow localhost origins.
 *
 * NOTE: In normal operation, the frontend accesses the backend via a Service
 * Binding (same-origin), so CORS is not triggered. This middleware protects
 * against direct cross-origin API access from unauthorized origins.
 */
import type { Env } from "../types.js";
import type { Context, Next } from "hono";

// ── Allowed Origins ─────────────────────────────────────────────────────────

/** Production frontend domain — the only non-localhost origin allowed. */
const PRODUCTION_ORIGINS: readonly string[] = [
  "https://dungeongpt.devteam-203.workers.dev",
];

/** Localhost origins allowed in development only. */
const DEV_ORIGINS: readonly string[] = [
  "http://localhost:5173",
  "http://localhost:8787",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8787",
];

/**
 * Build the allowed origin list based on the ENVIRONMENT binding.
 * Returns only production origins in production; adds dev origins otherwise.
 */
function getAllowedOrigins(environment: string): string[] {
  const origins = [...PRODUCTION_ORIGINS];

  if (environment !== "production") {
    origins.push(...DEV_ORIGINS);
  }

  return origins;
}

/** CORS headers sent on preflight and actual responses. */
const CORS_METHODS = "GET, POST, PUT, DELETE, OPTIONS";
const CORS_HEADERS = "Content-Type, Authorization";
const CORS_MAX_AGE = "86400";

/**
 * CORS middleware.
 * Reads the ENVIRONMENT binding to determine which origins to allow.
 * Handles preflight (OPTIONS) and adds CORS headers to all responses.
 */
export async function corsMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next,
) {
  const origin = c.req.header("origin");

  // No Origin header means same-origin or non-browser request — skip CORS
  if (!origin) {
    return next();
  }

  const allowedOrigins = getAllowedOrigins(c.env.ENVIRONMENT);

  // Reject requests from unauthorized origins
  if (!allowedOrigins.includes(origin)) {
    return next();
  }

  // Handle preflight (OPTIONS) requests
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": CORS_METHODS,
        "Access-Control-Allow-Headers": CORS_HEADERS,
        "Access-Control-Max-Age": CORS_MAX_AGE,
      },
    });
  }

  // Proceed with the actual request and add CORS headers to the response
  await next();

  c.res.headers.set("Access-Control-Allow-Origin", origin);
  c.res.headers.set("Access-Control-Allow-Methods", CORS_METHODS);
  c.res.headers.set("Access-Control-Allow-Headers", CORS_HEADERS);
}
