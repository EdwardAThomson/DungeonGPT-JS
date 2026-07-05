export interface Env {
  AI: Ai;
  ENVIRONMENT: string;
  // Data Postgres (Hetzner games box), reached via Cloudflare Hyperdrive.
  HYPERDRIVE: Hyperdrive;
  // SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are the OLD data-project creds.
  // Kept only so the pre-migration db.ts still compiles for a quick rollback;
  // remove once the Hyperdrive cutover is confirmed stable.
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  // Auth hub — untouched by this migration.
  OCTONION_SUPABASE_URL?: string;
  CUSTOM_DOMAIN?: string;
  ALLOW_UNAUTHENTICATED_DEV?: string;
}
