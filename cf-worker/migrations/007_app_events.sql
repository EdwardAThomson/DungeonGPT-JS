-- 007_app_events.sql
-- Product analytics events (backlog #86): anonymous first-session funnel + retention.
-- One row per client event, ingested by POST /api/events (unauthenticated by design;
-- protected by the CORS origin allowlist, a server-side event-name allowlist, a
-- 1KB props cap, and an IP-keyed fixed-window rate limit over request_counters).
--
-- Privacy posture: NO user_id column, no IP stored (the IP is used transiently for
-- rate limiting only). anon_id is a client-minted random id scoped to one browser,
-- never joined to accounts. The event-name allowlist keeps payloads non-sensitive.
--
-- TARGET: the self-hosted data Postgres on the games box (reached by the Worker via
-- Hyperdrive). NOT the retired D1/SQLite database that 001_initial_schema.sql describes.
--
-- RUNBOOK (manual apply, never run automatically; apply BEFORE deploying the Worker
-- build that ships routes/events.ts):
--   On the box:
--     psql -U dungeongpt -d dungeongpt -f 007_app_events.sql
--   Or through the local dev tunnel (port 5433, per wrangler.toml):
--     psql "<tunnel connection string, see private ops notes>" -f cf-worker/migrations/007_app_events.sql
--
-- Reading the data: SQL via the admin tooling. Suggested starters:
--   funnel:    SELECT event, count(DISTINCT anon_id) FROM app_events GROUP BY event;
--   d7 return: SELECT count(DISTINCT a.anon_id) FROM app_events a JOIN app_events b
--              ON a.anon_id = b.anon_id AND b.ts BETWEEN a.ts + interval '1 day'
--              AND a.ts + interval '7 day' WHERE a.event = 'app_open';

CREATE TABLE IF NOT EXISTS app_events (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  anon_id TEXT NOT NULL CHECK (char_length(anon_id) <= 64),
  event TEXT NOT NULL CHECK (char_length(event) <= 40),
  props JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS app_events_event_ts_idx ON app_events (event, ts);
CREATE INDEX IF NOT EXISTS app_events_anon_ts_idx ON app_events (anon_id, ts);

-- Worker role: ingest only (no read path in the Worker). Admin role reads.
GRANT INSERT ON app_events TO dungeongpt;
GRANT USAGE ON SEQUENCE app_events_id_seq TO dungeongpt;
GRANT SELECT ON app_events TO dungeongpt_admin;
