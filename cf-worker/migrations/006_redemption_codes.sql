-- 006_redemption_codes.sql
-- Redemption codes: time-boxed tier grants redeemed in-app (backlog #6 first slice).
-- Codes are the billing MVP, shipping BEFORE payment rails: playtester rewards,
-- launch promos, refund/goodwill instruments (maintainer 2026-07-06/07).
--
-- TARGET: the self-hosted data Postgres on the games box (reached by the Worker via
-- Hyperdrive). NOT the retired D1/SQLite database that 001_initial_schema.sql describes.
--
-- RUNBOOK (manual apply, never run automatically; apply BEFORE deploying the Worker
-- that carries POST /api/db/redeem-code and the effective-tier lookup; without the
-- tables the redeem endpoint 500s and the tier lookup throws, so callers degrade to
-- their existing failure postures, never to corrupt data):
--   On the box:
--     (connect to the games box; connection details live in the private ops notes)
--     psql -U dungeongpt -d dungeongpt -f 006_redemption_codes.sql
--   Or through the local dev tunnel (port 5433, per wrangler.toml):
--     psql "<tunnel connection string, see private ops notes>" \
--       -f cf-worker/migrations/006_redemption_codes.sql
--
-- CODE LIFECYCLE (no immortal codes, no code sprawl):
-- * Codes are generated in the private admin panel, in small batches, each batch
--   with a note ('july playtest wave', ...). There is no in-repo generator.
-- * expires_at is MANDATORY: every code has a redemption window and dies with it.
-- * A code also dies when uses reaches max_uses, or immediately via disabled = true
--   (the kill switch for a leaked batch).
-- * Redeeming never deletes anything: redemption_codes rows and code_redemptions
--   rows are the audit trail; tier_grants rows expire passively (a lapsed grant
--   simply stops counting toward the effective tier; grandfathering holds because
--   tiers gate creation, never play).
--
-- MANUAL CODE (emergency only; normal creation goes through the admin panel):
--   INSERT INTO redemption_codes (code, grants_tier, grant_days, max_uses, expires_at, note)
--   VALUES ('ABCD-EFGH-JKLM', 'member', 30, 1, now() + interval '60 days', 'goodwill: support ticket');
--
-- DISABLE A CODE / A BATCH:
--   UPDATE redemption_codes SET disabled = true WHERE code = 'ABCD-EFGH-JKLM';
--   UPDATE redemption_codes SET disabled = true WHERE note = 'july playtest wave';
--
-- DESIGN NOTES (keep these properties; the admin panel is built against this schema):
-- * code is the canonical dashed form XXXX-XXXX-XXXX, Crockford-style base32 with
--   no 0/O/1/I (32-char alphabet: 2-9 plus A-Z minus I and O). The Worker
--   normalizes user input (uppercase, strip spaces/dashes) before lookup.
-- * grants_tier rides the #39 ladder ('member' | 'premium' | 'elite'); grant_days
--   is the membership window opened at redemption time (e.g. 30).
-- * tier_grants is source-tagged ('code:<CODE>' here) so future grant sources
--   (billing, admin comps) share the table and the audit trail.
-- * code_redemptions PK (code, user_id): one redemption of a given code per account,
--   enforced by the database, not just the endpoint.

CREATE TABLE IF NOT EXISTS redemption_codes (
  code        TEXT PRIMARY KEY,          -- human-typable, XXXX-XXXX-XXXX Crockford base32, no 0/O/1/I
  grants_tier TEXT NOT NULL,             -- 'member' | 'premium' | 'elite'
  grant_days  INT  NOT NULL,             -- e.g. 30
  max_uses    INT  NOT NULL DEFAULT 1,
  uses        INT  NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,      -- the CODE's redemption window (mandatory: no immortal codes)
  disabled    BOOLEAN NOT NULL DEFAULT false,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tier_grants (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL,
  tier       TEXT NOT NULL,
  source     TEXT NOT NULL,              -- 'code:<CODE>' for this feature
  starts_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS tier_grants_user_active ON tier_grants (user_id, expires_at);

CREATE TABLE IF NOT EXISTS code_redemptions (
  code        TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (code, user_id)            -- one redemption of a given code per account
);

-- The Worker's role redeems (claim a use, append the grant + redemption) and reads
-- grants for the effective tier. No DELETE anywhere: nothing in this feature deletes.
GRANT SELECT, UPDATE ON redemption_codes TO dungeongpt;
GRANT SELECT, INSERT ON tier_grants TO dungeongpt;
GRANT USAGE ON SEQUENCE tier_grants_id_seq TO dungeongpt;
GRANT SELECT, INSERT ON code_redemptions TO dungeongpt;

-- The admin panel's least-privilege role (dungeongpt_admin) mints batches, flips the
-- disable kill switch, and reads the redemptions view. Still no DELETE anywhere.
GRANT SELECT, INSERT, UPDATE ON redemption_codes TO dungeongpt_admin;
GRANT SELECT ON tier_grants TO dungeongpt_admin;
GRANT SELECT ON code_redemptions TO dungeongpt_admin;
