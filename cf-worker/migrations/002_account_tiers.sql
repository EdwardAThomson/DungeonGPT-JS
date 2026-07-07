-- 002_account_tiers.sql
-- Account tiers for server-side entitlements (backlog #39).
--
-- TARGET: the self-hosted data Postgres on the games box (reached by the Worker via
-- Hyperdrive). NOT the retired D1/SQLite database that 001_initial_schema.sql describes.
--
-- RUNBOOK (manual apply, never run automatically):
--   On the box:
--     (connect to the games box; connection details live in the private ops notes)
--     psql -U dungeongpt -d dungeongpt -f 002_account_tiers.sql
--   Or through the local dev tunnel (port 5433, per wrangler.toml):
--     psql "<tunnel connection string, see private ops notes>" \
--       -f cf-worker/migrations/002_account_tiers.sql
--
-- MANUAL TIER GRANT (the only write path until billing lands; there is no PUT endpoint):
--   INSERT INTO account_tiers (user_id, tier, note)
--   VALUES ('<auth-hub-sub-uuid>', 'member', 'playtester')
--   ON CONFLICT (user_id) DO UPDATE
--     SET tier = EXCLUDED.tier, note = EXCLUDED.note, updated_at = now();
--
-- REVOKE: set the tier back to 'free' (or DELETE the row; no row means 'free'):
--   UPDATE account_tiers SET tier = 'free', updated_at = now() WHERE user_id = '<uuid>';
--
-- DESIGN NOTES (keep these properties):
-- * Account-scoped and game-agnostic: user_id is the auth hub subject (the JWT `sub`
--   the Worker extracts in middleware/auth.ts). The table stores ONLY the tier; the
--   tier-to-benefit mapping lives client/game-side (src/game/entitlements.js). That
--   keeps this table hoistable to the Octonion hub later with no schema change.
-- * Ladder: free < member < premium < elite. Launch scope is free + member, but all
--   four are modelled now so later tiers need no migration.
-- * note is for manual grants only ('playtester', 'founder', ...), free-form.

CREATE TABLE IF NOT EXISTS account_tiers (
  user_id TEXT PRIMARY KEY,
  tier TEXT NOT NULL DEFAULT 'free'
    CHECK (tier IN ('free', 'member', 'premium', 'elite')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT NULL
);
