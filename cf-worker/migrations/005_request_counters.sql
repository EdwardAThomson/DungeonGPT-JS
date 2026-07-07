-- 005_request_counters.sql
-- Fixed-window request counters for Worker rate limiting (backlog #12) and the
-- premium AI daily allowance (backlog #7).
--
-- TARGET: the self-hosted data Postgres on the games box (reached by the Worker via
-- Hyperdrive). NOT the retired D1/SQLite database that 001_initial_schema.sql describes.
--
-- RUNBOOK (manual apply, never run automatically; apply BEFORE deploying the
-- rate-limited Worker so the counter upserts have a table to land in; the limiter
-- fails OPEN if the table is missing, so a missed migration degrades to "no
-- throttling", never to an outage):
--   On the box:
--     (connect to the games box; connection details live in the private ops notes)
--     psql -U dungeongpt -d dungeongpt -f 005_request_counters.sql
--   Or through the local dev tunnel (port 5433, per wrangler.toml):
--     psql "<tunnel connection string, see private ops notes>" \
--       -f cf-worker/migrations/005_request_counters.sql
--
-- HOW IT IS USED (cf-worker/src/middleware/rateLimit.ts owns the mechanics):
-- * One row per (user, bucket, fixed window). window_start is the aligned start of
--   the window (5-minute windows for the request buckets, the UTC day for the
--   'ai-premium-daily' allowance).
-- * The Worker does a single atomic upsert-increment per counted request:
--     INSERT ... VALUES (user, bucket, window, 1)
--     ON CONFLICT (user_id, bucket, window_start)
--       DO UPDATE SET count = request_counters.count + 1
--     RETURNING count;
--   and compares the returned count against the bucket's limit. One round trip,
--   race-free under concurrency.
-- * Buckets and limits are constants in rateLimit.ts (RATE_LIMITS /
--   PREMIUM_DAILY_LIMITS); the table is schema-agnostic about them on purpose, so
--   tuning a limit is a code deploy, never a migration.
--
-- CLEANUP (rows are only ever read within their own window, so anything older than
-- the longest window plus slack is dead weight; the daily premium bucket is the
-- longest at 1 day, so 2 days is a safe horizon):
--   DELETE FROM request_counters WHERE window_start < now() - interval '2 days';
--
-- CRON SUGGESTION (on the games box; low traffic means the table stays tiny, this
-- just keeps it from growing without bound):
--   # crontab -e for the maintainer user, daily at 04:10
--   10 4 * * * psql -U dungeongpt -d dungeongpt -c "DELETE FROM request_counters WHERE window_start < now() - interval '2 days';"
--
-- DESIGN NOTES (keep these properties):
-- * Fixed-window, not sliding: cheap, one row, one upsert. The worst-case burst at
--   a window boundary is 2x the limit, which is acceptable for abuse throttling
--   (this is not billing; billing/usage accounting is backlog #6).
-- * user_id is the auth hub subject (JWT `sub`), same key as account_tiers.
-- * The Worker fails OPEN on any counter error (availability over strictness):
--   a DB blip must never take AI generation down with it.

CREATE TABLE IF NOT EXISTS request_counters (
  user_id TEXT NOT NULL,
  bucket TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, bucket, window_start)
);

-- The Worker's role increments and reads counters; DELETE is granted so the cleanup
-- recipe (or a future in-Worker sweep) can run under the same role.
GRANT SELECT, INSERT, UPDATE, DELETE ON request_counters TO dungeongpt;
