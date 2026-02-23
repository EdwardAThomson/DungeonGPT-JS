/**
 * Security headers middleware for Hono.
 *
 * Adds defense-in-depth HTTP headers to all responses:
 *  - Content-Security-Policy: restricts resource loading
 *  - Strict-Transport-Security: enforces HTTPS
 *  - X-Frame-Options: prevents clickjacking
 *  - X-Content-Type-Options: prevents MIME sniffing
 *  - Referrer-Policy: limits referrer leakage
 *  - Permissions-Policy: restricts browser features
 */
import type { Env } from "../types.js";
import type { Context, Next } from "hono";

/**
 * Content-Security-Policy directives.
 *
 * The backend is a JSON API — it serves no HTML. The CSP is strict by default.
 * If the backend ever serves HTML (error pages, etc.), this prevents XSS.
 */
const CSP_DIRECTIVES = "default-src 'none'; frame-ancestors 'none'";

/**
 * Security headers middleware.
 * Applied globally to all responses from the backend Worker.
 */
export async function securityHeadersMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next,
) {
  await next();

  // Prevent clickjacking
  c.res.headers.set("X-Frame-Options", "DENY");

  // Prevent MIME type sniffing
  c.res.headers.set("X-Content-Type-Options", "nosniff");

  // Enforce HTTPS (1 year, include subdomains)
  c.res.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );

  // Content Security Policy — strict for JSON API
  c.res.headers.set("Content-Security-Policy", CSP_DIRECTIVES);

  // Limit referrer information
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Restrict browser features the API does not need
  c.res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
}
