/**
 * Worker environment bindings.
 *
 * Defines the shape of `env` passed to the Worker by the Cloudflare runtime.
 * D1 database binding and AI binding are declared here.
 */
export interface Env {
  /** Cloudflare D1 database binding */
  DB: D1Database;

  /** Cloudflare Workers AI binding */
  AI: Ai;

  /**
   * Environment name for configuration branching.
   * Set in wrangler.toml per environment.
   */
  ENVIRONMENT: string;

  // ── Secrets (set via `wrangler secret put`) ──────────────────────────

  /** Clerk JWT verification key — added in Phase 10 */
  CLERK_SECRET_KEY?: string;
}
