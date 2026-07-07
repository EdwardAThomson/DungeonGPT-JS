-- 004_premium_templates.sql
-- Server-side premium story-template storage (backlog #40: server-delivered
-- premium content channel).
--
-- TARGET: the self-hosted data Postgres on the games box (reached by the Worker via
-- Hyperdrive). NOT the retired D1/SQLite database that 001_initial_schema.sql describes.
--
-- RUNBOOK (manual apply, never run automatically):
--   On the box:
--     (connect to the games box; connection details live in the private ops notes)
--     psql -U dungeongpt -d dungeongpt -f 004_premium_templates.sql
--   Or through the local dev tunnel (port 5433, per wrangler.toml):
--     psql "<tunnel connection string, see private ops notes>" \
--       -f cf-worker/migrations/004_premium_templates.sql
--
-- LOADING A TEMPLATE (the only write path until an admin endpoint lands; content is
-- authored in the private repo, dungeongpt-premium-content, one JSON file per
-- template, same object shape as a src/data/storyTemplates.js entry):
--
--   Option A, pure psql (\set + backtick shell-out reads the file):
--     psql -U dungeongpt -d dungeongpt
--       \set content `cat /path/to/dungeongpt-premium-content/templates/heroic-fantasy-t3.json`
--       INSERT INTO premium_templates (id, min_tier, template)
--       VALUES ('heroic-fantasy-t3', 'member', :'content'::jsonb)
--       ON CONFLICT (id) DO UPDATE
--         SET template = EXCLUDED.template, min_tier = EXCLUDED.min_tier,
--             enabled = true, updated_at = now();
--
--   Option B, one command from a shell (psql -v passes the file content as a psql
--   variable; :'content' quotes it safely and the ::jsonb cast validates it
--   server-side, so a malformed file errors and nothing is written):
--     psql -U dungeongpt -d dungeongpt \
--       -v content="$(cat /path/to/dungeongpt-premium-content/templates/heroic-fantasy-t3.json)" \
--       -c "INSERT INTO premium_templates (id, min_tier, template)
--           VALUES ('heroic-fantasy-t3', 'member', :'content'::jsonb)
--           ON CONFLICT (id) DO UPDATE
--             SET template = EXCLUDED.template, min_tier = EXCLUDED.min_tier,
--                 enabled = true, updated_at = now();"
--
-- DISABLING (pull a template from delivery without deleting the authored content):
--   UPDATE premium_templates SET enabled = false, updated_at = now()
--   WHERE id = 'heroic-fantasy-t3';
--   (re-enable: enabled = true; entitled clients pick the change up next session)
--
-- DESIGN NOTES (keep these properties):
-- * The `template` JSONB IS the storyTemplates entry, verbatim: the Worker serves it
--   untransformed and the client registers it into the same picker array the built-in
--   templates live in (src/data/storyTemplates.js, registerPremiumTemplates). No
--   server-side schema knowledge of milestones/encounters, so authoring stays free.
-- * min_tier uses the #39 ladder (free < member < premium < elite); the Worker serves
--   a row only to callers whose account_tiers rank is >= min_tier's rank. 'free' is
--   allowed by the CHECK for completeness (a globally delivered template), though in
--   practice free content just ships in the public bundle.
-- * enabled is the kill switch: disabled rows are invisible to every tier.
-- * Content rows are maintainer-authored via psql only; there is no write endpoint.

CREATE TABLE IF NOT EXISTS premium_templates (
  id TEXT PRIMARY KEY,
  min_tier TEXT NOT NULL
    CHECK (min_tier IN ('free', 'member', 'premium', 'elite')),
  template JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  enabled BOOLEAN NOT NULL DEFAULT true
);

-- The Worker's role reads the catalog; INSERT/UPDATE are granted now so a future
-- admin endpoint (post-billing) needs no new migration. No DELETE: retirement is
-- `enabled = false`, so authored content is never destroyed from the app path.
GRANT SELECT, INSERT, UPDATE ON premium_templates TO dungeongpt;
