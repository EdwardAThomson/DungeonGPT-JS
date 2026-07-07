# Ops Runbook

Operational reference for running DungeonGPT in production: architecture truth,
incident quick checks, deploys, rollbacks, backups, and the restore drill.
Covers backlog #19 (this runbook), #20 (backups + restore drill), #11 (Worker
deploy CI), #21 (post-deploy smoke test). When this doc and the code disagree,
the code wins; fix the doc.

Related: `docs/DEPLOYMENT_ARCHITECTURE.md` (local-only, fuller architecture
narrative), `docs/CF_WORKER_GUIDE.md` (Worker/model reference),
`cf-worker/migrations/*.sql` (each migration carries its own apply runbook in
the header comment).

---

## 1. Architecture one-pager (post-cutover truth)

```
Browser (dungeongpt.xyz)
   |
   |-- static app ------ Cloudflare Pages (auto-deploys from master via GitHub integration)
   |
   |-- sign-in --------- Octonion hub (octonion.io) issues Supabase-format JWTs
   |
   '-- /api/* ---------- Cloudflare Worker `dungeongpt-api` (cf-worker/, Hono + TS)
                            |-- /api/ai, /api/embed, /api/image  -> Workers AI binding
                            |-- /api/db/* (requireAuth: JWT verified against hub JWKS)
                            '------ Hyperdrive -----> self-hosted Postgres
                                                      Hetzner box (ssh alias in your local ssh config)
                                                      db: dungeongpt, app role: dungeongpt
```

- **Frontend:** CRA build on Cloudflare Pages. Deploys automatically on push to
  `master`; PR pushes get preview deploys at `*.dungeongpt-js.pages.dev`.
- **Worker:** `dungeongpt-api` (cf-worker/). Deployed by CI on pushes to
  `master` touching `cf-worker/**` (see section 4), or manually with
  `cd cf-worker && npm run deploy`.
- **Database:** self-hosted PostgreSQL on the Hetzner games box. This is NOT
  Supabase anymore; the data plane was cut over. The Worker reaches it through
  Cloudflare Hyperdrive (binding `HYPERDRIVE` in `cf-worker/wrangler.toml`);
  the box firewall allows inbound 5432 from Cloudflare IP ranges only.
  Superuser access on the box: `sudo -u postgres psql`.
- **Auth:** Octonion hub issues the JWTs; `cf-worker/src/middleware/auth.ts`
  verifies them via the hub's JWKS endpoint (10 minute cache), checks
  expiry/issuer/`role: authenticated`, and uses `sub` as `userId`. Supabase
  remains in the picture only as the auth-token format and the hub's backend.
- **Migrations:** files in `cf-worker/migrations/` (002+ target the box;
  001 describes the retired D1/SQLite schema). Applied MANUALLY via psql, per
  the runbook in each file's header. Never applied automatically. Ordering
  rule: **migration before Worker deploy** (section 5).
- **Backups:** `scripts/ops/backup-postgres.sh` on the box, nightly, with
  offsite copies in R2 (section 6). Nothing backs this database up for us;
  it is entirely our responsibility.

---

## 2. Incident quick checks

Work top-down; each check isolates one layer.

### Site down / blank page

1. https://www.cloudflarestatus.com/ (Pages or the CDN itself).
2. Cloudflare dashboard > Workers & Pages > `dungeongpt-js` (Pages project):
   is the latest deployment green? A red build means Pages shipped nothing new
   and the previous deploy should still be serving.
3. Try the alias https://dungeongpt-js.pages.dev/ directly. If the alias works
   but dungeongpt.xyz does not, it is DNS/custom-domain, not the app.

### Worker errors (API failing, AI generation failing)

1. Live logs: `cd cf-worker && npx wrangler tail dungeongpt-api`
   (requires a wrangler login or `CLOUDFLARE_API_TOKEN`).
2. Smoke it: `SMOKE_WORKER_URL=https://<worker-host> node scripts/ops/smoke-prod.mjs`
   (section 4 covers what it checks). A failing auth-wall check is an incident
   on its own even if the site "works".
3. Dashboard > Workers & Pages > `dungeongpt-api` > Metrics: error rate, CPU
   time. Workers AI model failures show as generation errors in the tail;
   `cf-worker/src/services/ai.ts` retries down a fallback chain, so a single
   flaky model usually degrades quietly rather than failing hard.

### Database down (saves failing, 500s from /api/db/*)

1. `ssh <games-box>`
2. `systemctl status postgresql` (and `sudo journalctl -u postgresql -n 100`).
3. `sudo -u postgres psql -d dungeongpt -c 'SELECT 1;'`
4. Disk: `df -h` (a full disk is the classic silent killer; backups in
   `/var/backups/dungeongpt` add pressure, retention pruning should hold it).
5. If Postgres is fine locally but the Worker still cannot reach it: check the
   Hyperdrive config in the Cloudflare dashboard, and the box firewall (inbound
   5432 must allow Cloudflare's published IP ranges; a firewall "refresh" that
   dropped those rules looks exactly like a DB outage from the Worker's side).

### Auth failures (users cannot sign in / everything 401s)

1. Is it everyone or one user? One user: token expiry, have them re-sign-in.
2. Hub JWKS reachable? `curl -s https://<octonion-supabase-host>/auth/v1/.well-known/jwks.json`
   (the exact base URL is the Worker's `OCTONION_SUPABASE_URL` secret).
3. `wrangler tail` and look for `Unauthorized` / issuer or key-id mismatches
   from `middleware/auth.ts`. Remember the JWKS cache is 10 minutes: after a
   hub key rotation, old Workers instances can reject new tokens for up to
   10 minutes. That self-heals; do not redeploy in a panic.
4. Octonion hub itself down: nothing to do app-side; sign-ins fail but guests
   and already-issued tokens keep working until expiry.

---

## 3. Deploy checklist

The ordering rule, established by the #39/#40/#54 PRs and encoded in each
migration header: **apply the migration BEFORE deploying the Worker build that
references it.** A Worker deployed ahead of its migration errors on every
request that names the new column/table; the reverse order is safe because the
old Worker never names the new field.

1. Be on a **fresh** `master` (`git pull`). A stale checkout has already
   shipped an old Worker once; CI deploys (section 4) exist to make that
   impossible, so prefer merging to master over manual deploys.
2. New migration in the change? Apply it on the box first, per the runbook in
   the migration file's header:
   ```
   ssh <games-box>
   psql -U dungeongpt -d dungeongpt -f 00X_the_migration.sql
   ```
   Verify (e.g. `\d+ <table>`), then deploy.
3. Deploy the Worker:
   - Normal path: merge/push to `master` touching `cf-worker/**`; the
     `Deploy Worker` workflow typechecks, deploys, and smoke-tests. If the
     push ADDED a migration file the workflow **fails on purpose** (migration
     guard); apply the migration (step 2), then re-run it manually
     (`gh workflow run deploy-worker.yml`), which skips the guard.
   - Manual fallback: `cd cf-worker && npm run deploy` (fresh checkout!).
4. Frontend needs nothing: Pages auto-deploys the same push.
5. Post-deploy: the workflow runs `scripts/ops/smoke-prod.mjs` automatically;
   after a manual deploy run it yourself. Then watch
   `npx wrangler tail dungeongpt-api` for a couple of minutes.

---

## 4. Worker deploy CI (backlog #11) and smoke test (#21)

Workflow: `.github/workflows/deploy-worker.yml`. Push to `master` touching
`cf-worker/**` (plus manual `workflow_dispatch`). Steps: migration guard >
`npm ci` > `tsc --noEmit` > `wrangler deploy` > `smoke-prod.mjs`. A
`concurrency: deploy-worker` group queues parallel merges so two deploys never
race.

**Migration guard:** the workflow diffs `cf-worker/migrations/` between the
pre-push commit and the pushed head; any ADDED file fails the run loudly with
apply instructions instead of deploying (migrations are manual by design and
must precede the deploy). `workflow_dispatch` skips the guard: it is the
"migration applied, now ship it" button.

**One-time setup:**

1. Mint a Cloudflare API token for CI: dash.cloudflare.com > My Profile >
   API Tokens > Create Token > start from the **Edit Cloudflare Workers**
   template, then restrict it to this one account (and no zones). The minimal
   grant wrangler needs to deploy is Account > Workers Scripts > Edit. Do NOT
   reuse the Worker's own runtime `CF_API_TOKEN` secret; mint a separate one
   so either can be revoked alone.
2. Wire the repo:
   ```
   gh secret set CF_API_TOKEN                       # paste the CI token
   gh variable set CF_ACCOUNT_ID --body "<account id>"
   gh variable set PROD_WORKER_URL --body "https://<worker-host>"
   ```
   The account id is in the Cloudflare dashboard sidebar (and in
   `cf-worker/wrangler.toml` as the `CF_ACCOUNT_ID` var). `PROD_WORKER_URL`
   is the deployed Worker's base URL (workers.dev host or custom route).

**Smoke test** (`scripts/ops/smoke-prod.mjs`): read-only, credential-free.
Checks `/health` shape and latency budget (default 3000ms), that
`/api/db/entitlements` and `/api/db/conversations` return 401 without a token
(the auth wall), and that unknown routes return the Worker's JSON 404. Local
use, against prod or `wrangler dev`:

```
SMOKE_WORKER_URL=https://<worker-host> node scripts/ops/smoke-prod.mjs
SMOKE_WORKER_URL=http://localhost:8787 node scripts/ops/smoke-prod.mjs
```

---

## 5. Rollback procedures

### Worker

Fastest: Cloudflare keeps prior Worker versions.

```
cd cf-worker
npx wrangler deployments list        # find the last good version
npx wrangler rollback                # interactive; picks a previous deployment
```

Or redeploy a known-good commit (from a clean checkout, mind the stale-deploy
trap):

```
git checkout <good-sha>
cd cf-worker && npm ci && npm run deploy
git checkout master
```

Then re-run the smoke test. If the bad deploy accompanied a migration,
read the migration notes below BEFORE touching the schema: rolling the Worker
back is almost always enough, because migrations are written to be
backward-compatible with the previous Worker (additive columns/tables).

### Frontend (Pages)

Cloudflare dashboard > Workers & Pages > `dungeongpt-js` > Deployments > pick
the previous production deployment > **Rollback to this deployment**. No CLI
needed. (Alternatively, revert the commit on master and let Pages rebuild.)

### Migrations (down notes)

Migrations are additive on purpose; the usual "rollback" is to roll the WORKER
back and leave the schema alone (an extra table/column is harmless to the old
Worker). Only run a down statement when the schema itself must go. Always
dump the affected table first (`pg_dump -Fc -t <table> dungeongpt > pre_down.dump`).

- **002_account_tiers.sql** (account tiers, #39)
  ```sql
  DROP TABLE IF EXISTS account_tiers;
  ```
  Destroys manual tier grants (playtester/founder notes). Only safe with a
  Worker predating #39; the current Worker's `/api/db/entitlements` and the
  tier join in `/api/db/premium-templates` 500 without this table.

- **003_conversation_rev.sql** (save-sync rev counter, #54)
  ```sql
  ALTER TABLE conversations DROP COLUMN IF EXISTS rev;
  ```
  Order matters in reverse: roll the Worker back FIRST, then drop the column.
  The rev-aware Worker names `rev` in every conversation save, so dropping the
  column under it breaks all saves. Dropping the column loses fork-detection
  lineage; clients fall back to "missing rev = 0" by design.

- **004_premium_templates.sql** (premium template delivery, #40)
  Soft down (preferred; content survives, delivery stops for everyone):
  ```sql
  UPDATE premium_templates SET enabled = false, updated_at = now();
  ```
  Hard down:
  ```sql
  DROP TABLE IF EXISTS premium_templates;
  ```
  Hard down destroys authored premium content rows (re-loadable from the
  private content repo) and 500s the current Worker's
  `/api/db/premium-templates`; only safe with a Worker predating #40.

---

## 6. Backups (backlog #20)

**The database has NO safety net except this.** Post-cutover, the production
Postgres is self-hosted on the Hetzner box; nobody backs it up for us.

Design: nightly `pg_dump` custom-format dumps on the box, dailies kept 14
days, weeklies kept 8 weeks (constants at the top of the script), offsite
copies in a Cloudflare R2 bucket via rclone. Custom format (`-Fc`) is
compressed and restores selectively via `pg_restore`. The script verifies each
dump's table of contents before counting it as a backup, and offsite uses
`rclone copy` plus age-based pruning (never `sync`) so a destroyed box cannot
cascade into destroyed offsite copies.

Scripts (in the repo; copy them to the box):

- `scripts/ops/backup-postgres.sh` (dump + weekly promotion + retention + offsite)
- `scripts/ops/restore-postgres.sh` (drill and production restore, section 7)

### Install on the box (one time)

```bash
# From the repo, ship the scripts:
ssh <games-box> 'sudo install -d -m 755 /opt/dungeongpt/ops'
scp scripts/ops/backup-postgres.sh scripts/ops/restore-postgres.sh \
    <games-box>:/tmp/
ssh <games-box> 'sudo install -m 755 /tmp/backup-postgres.sh /tmp/restore-postgres.sh /opt/dungeongpt/ops/'

# Backup directory owned by postgres (peer auth, no password anywhere):
ssh <games-box> 'sudo install -d -o postgres -g postgres -m 700 /var/backups/dungeongpt'

# First run, by hand, to prove the pipeline before scheduling it:
ssh <games-box> 'sudo -u postgres /opt/dungeongpt/ops/backup-postgres.sh'
```

No env file is needed when running as `postgres` on the box. If credentials
ever are needed (remote PGHOST, different role), put PG* variables in
`/etc/dungeongpt/backup.env` and `chmod 600` it; the script refuses a
world-readable env file.

### Offsite to R2 (recommended)

Any S3-compatible target works; R2 fits the existing Cloudflare stack and has
no egress fees. One time:

```bash
# 1. Create the bucket (dashboard > R2, or):
npx wrangler r2 bucket create dungeongpt-backups

# 2. Mint an R2 API token: dashboard > R2 > Manage R2 API Tokens >
#    Create API Token > permission "Object Read & Write", scoped to ONLY the
#    dungeongpt-backups bucket. Note the Access Key ID / Secret Access Key.

# 3. On the box, as the user that runs backups (postgres):
sudo -u postgres rclone config create r2 s3 \
  provider=Cloudflare \
  access_key_id=<r2-access-key-id> \
  secret_access_key=<r2-secret-access-key> \
  endpoint=https://<cf-account-id>.r2.cloudflarestorage.com \
  acl=private no_check_bucket=true
sudo -u postgres chmod 600 /var/lib/postgresql/.config/rclone/rclone.conf

# 4. Verify:
sudo -u postgres rclone lsd r2:dungeongpt-backups
sudo -u postgres /opt/dungeongpt/ops/backup-postgres.sh --offsite
sudo -u postgres rclone ls r2:dungeongpt-backups/daily
```

The default remote is `r2:dungeongpt-backups` (override with
`RCLONE_REMOTE=<remote>:<bucket>` if you name the rclone remote differently).

### Scheduling: pick ONE of the two

**Option A, crontab** (simplest; `sudo -u postgres crontab -e`):

```cron
# DungeonGPT nightly Postgres backup + offsite (03:17 box time)
17 3 * * * /opt/dungeongpt/ops/backup-postgres.sh --offsite >> /var/log/dungeongpt-backup.log 2>&1
```

(Also `sudo touch /var/log/dungeongpt-backup.log && sudo chown postgres /var/log/dungeongpt-backup.log`.)

**Option B, systemd timer** (preferred: catches up after downtime via
`Persistent=true`, logs to the journal, no overlap):

```bash
sudo tee /etc/systemd/system/dungeongpt-backup.service > /dev/null <<'EOF'
[Unit]
Description=DungeonGPT nightly Postgres backup (pg_dump + offsite)
After=postgresql.service
Requires=postgresql.service

[Service]
Type=oneshot
User=postgres
ExecStart=/opt/dungeongpt/ops/backup-postgres.sh --offsite
EOF

sudo tee /etc/systemd/system/dungeongpt-backup.timer > /dev/null <<'EOF'
[Unit]
Description=Nightly DungeonGPT Postgres backup

[Timer]
OnCalendar=*-*-* 03:17:00
RandomizedDelaySec=10m
Persistent=true

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now dungeongpt-backup.timer
systemctl list-timers dungeongpt-backup.timer     # confirm next run
sudo systemctl start dungeongpt-backup.service    # one manual run now
journalctl -u dungeongpt-backup.service -n 50     # check it
```

### Monitoring the backups

Weekly-ish eyeball (or fold into the restore drill, section 7):

```bash
ssh <games-box> 'ls -lht /var/backups/dungeongpt/daily | head -5'
ssh <games-box> 'sudo -u postgres rclone ls r2:dungeongpt-backups/daily | tail -3'
ssh <games-box> 'journalctl -u dungeongpt-backup.service --since -8d | grep -E "complete|FAIL|error" | tail'
```

A dump dated yesterday or today, of a plausible size (compare against the
previous week), means the pipeline is alive.

---

## 7. Restore drill (backlog #20)

**Cadence: monthly.** A backup that has never been restored is a hope, not a
backup. The drill restores the latest dump into a scratch database on the box,
checks row counts, and drops the scratch db. Zero impact on production.
Record every drill in the log table at the bottom of this file.

### The drill, exactly

```bash
ssh <games-box>

# 1. Restore the newest daily dump into dungeongpt_drill (drops/recreates it):
sudo -u postgres /opt/dungeongpt/ops/restore-postgres.sh --to-scratch-db

# The script prints sanity row counts on success. To eyeball them yourself:
sudo -u postgres psql -d dungeongpt_drill -c "
  SELECT 'conversations'      AS tbl, count(*) FROM conversations
  UNION ALL SELECT 'heroes',            count(*) FROM heroes
  UNION ALL SELECT 'account_tiers',     count(*) FROM account_tiers
  UNION ALL SELECT 'premium_templates', count(*) FROM premium_templates;"

# 2. Judge: counts should be nonzero for conversations/heroes and in the same
#    ballpark as production. Spot-check one recent save actually has content:
sudo -u postgres psql -d dungeongpt_drill -c "
  SELECT session_id, updated_at, octet_length(world_map::text) AS world_map_bytes
  FROM conversations ORDER BY updated_at DESC LIMIT 3;"

# 3. Drop the scratch database:
sudo -u postgres psql -d postgres -c 'DROP DATABASE dungeongpt_drill WITH (FORCE);'

# 4. Record the drill in the log table below (date, dump file, counts, ok?).
```

Every third drill or so, exercise the offsite leg instead: pull a dump from R2
first (`sudo -u postgres rclone copy r2:dungeongpt-backups/daily/<file>.dump /tmp/`)
and pass that file to the restore script; that proves the copies in R2 are
real too.

### Real recovery (production restore)

Only in an actual data-loss incident:

```bash
ssh <games-box>
sudo -u postgres /opt/dungeongpt/ops/restore-postgres.sh --to-production [dump-file]
```

It demands typed confirmation of the database name, terminates live
connections, drops and recreates `dungeongpt`, restores in a single
transaction, and prints the sanity counts. Afterwards run the smoke test and
watch `wrangler tail`. Anything written between the dump and the incident is
lost (nightly cadence = up to 24h exposure; tighten `OnCalendar` if that ever
stops being acceptable).

---

## 8. Secrets inventory (names and locations only, never values)

| Name | What it is | Where it lives |
|---|---|---|
| `CF_API_TOKEN` (Worker runtime) | Cloudflare API token the Worker uses for Workers AI REST calls (image gen) | `wrangler secret put CF_API_TOKEN`; local: `cf-worker/.dev.vars` |
| `OCTONION_SUPABASE_URL` | Auth hub base URL for JWKS verification (`SUPABASE_URL` is the legacy fallback name) | `wrangler secret put`; local: `cf-worker/.dev.vars` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | LEGACY pre-cutover data-project creds, kept only for quick rollback of the Hyperdrive cutover; retire once stable | Worker secrets (wrangler) |
| Hyperdrive connection string | Contains the `dungeongpt` DB role password | Inside the Cloudflare Hyperdrive config (created via `wrangler hyperdrive create`); never in the repo. Local dev uses `WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` + ssh tunnel (recipe in `cf-worker/wrangler.toml`) |
| `CF_API_TOKEN` (GitHub Actions) | SEPARATE CI-only token, Workers Scripts:Edit, for `wrangler deploy` | `gh secret set CF_API_TOKEN` (repo Actions secret) |
| `CF_ACCOUNT_ID`, `PROD_WORKER_URL` | Not secret; deploy workflow config | GitHub Actions repo variables |
| Postgres role passwords (`dungeongpt`, `postgres`) | DB auth on the box | In Postgres on the box; box login is ssh-key only (`ssh <games-box>`) |
| `/etc/dungeongpt/backup.env` | Optional PG* creds for backup/restore scripts | On the box, chmod 600 (scripts refuse it otherwise) |
| rclone R2 credentials | Offsite backup bucket keys (Object Read & Write, one bucket) | `~postgres/.config/rclone/rclone.conf` on the box, chmod 600 |
| `REACT_APP_SUPABASE_URL` / `_ANON_KEY`, `REACT_APP_CF_WORKER_URL` | Frontend build-time config (anon key is public by design) | Pages build environment; local `.env` |
| Server LLM keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`) | Local Express dev server only, never production | Local `.env` |

Rotation notes: revoking the CI token only breaks deploys; revoking the
Worker runtime token only breaks image gen; rotating the DB password means
recreating the Hyperdrive config (`wrangler hyperdrive create`, then update
the `id` in `wrangler.toml`) and redeploying.

---

## 9. Restore drill log

One row per drill (section 7). Newest first.

| Date | Dump file | conversations | heroes | account_tiers | premium_templates | Offsite leg? | Result / notes | Operator |
|---|---|---|---|---|---|---|---|---|
| _(none yet; first drill pending)_ | | | | | | | | |
