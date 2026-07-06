#!/usr/bin/env bash
#
# restore-postgres.sh - restore a pg_dump custom-format dump of the DungeonGPT
# database. Backlog #20. See docs/OPS_RUNBOOK.md ("Restore drill") for the
# monthly drill procedure and the drill log.
#
# WHERE IT RUNS: on the database box (ssh octonion-games), as a role that can
# CREATE DATABASE. The simplest invocation is via the postgres superuser:
#   sudo -u postgres bash scripts/ops/restore-postgres.sh --to-scratch-db
#
# TWO MODES:
#   --to-scratch-db [name]   (default name: dungeongpt_drill)
#       Restores into a fresh scratch database, then prints sanity row counts.
#       Safe to run any time; this is the restore-drill mode. The scratch db is
#       dropped and recreated on every run. Never pointed at by anything.
#
#   --to-production
#       DESTRUCTIVE. Drops and recreates the live `dungeongpt` database from
#       the dump. Terminates existing connections (the Worker will error until
#       the restore finishes). Requires typing the database name to confirm.
#       Use only during a real recovery, after stopping writes if possible.
#
# DUMP SELECTION: pass a dump file path as the last argument, or omit it to
# use the newest file in $BACKUP_ROOT/daily (falling back to weekly). To
# restore from offsite first fetch it, e.g.:
#   rclone copy r2:dungeongpt-backups/daily/<file>.dump /tmp/
#
# SECRETS: none inline. Same optional $ENV_FILE pattern as backup-postgres.sh
# (PG* variables, chmod 600) if you are not running as the postgres user.
#
set -euo pipefail

DB_NAME="${DB_NAME:-dungeongpt}"
DB_OWNER="${DB_OWNER:-dungeongpt}"           # role that owns restored objects
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/dungeongpt}"
SCRATCH_DB_DEFAULT="${SCRATCH_DB_DEFAULT:-dungeongpt_drill}"
ENV_FILE="${ENV_FILE:-/etc/dungeongpt/backup.env}"

# Tables whose row counts prove the restore carried real data (see runbook).
SANITY_TABLES=(conversations heroes account_tiers premium_templates)

usage() { grep '^#' "$0" | sed 's/^# \{0,1\}//'; }
log() { echo "[restore-postgres] $(date -Is) $*"; }

if [ -f "$ENV_FILE" ]; then
  if [ "$(stat -c '%a' "$ENV_FILE" | rev | cut -c1)" != "0" ]; then
    echo "restore-postgres.sh: $ENV_FILE is world-accessible; chmod 600 it first" >&2
    exit 2
  fi
  # shellcheck source=/dev/null
  . "$ENV_FILE"
fi

MODE=""
TARGET_DB=""
DUMP_FILE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --to-scratch-db)
      MODE="scratch"
      # Optional scratch db name follows the flag (must not look like a flag/path).
      if [ $# -gt 1 ] && [[ "$2" != --* ]] && [[ "$2" != *.dump ]] && [[ "$2" != */* ]]; then
        TARGET_DB="$2"; shift
      fi
      ;;
    --to-production) MODE="production" ;;
    -h|--help) usage; exit 0 ;;
    *)
      if [ -n "$DUMP_FILE" ]; then echo "restore-postgres.sh: unexpected argument: $1" >&2; exit 2; fi
      DUMP_FILE="$1"
      ;;
  esac
  shift
done

if [ -z "$MODE" ]; then
  echo "restore-postgres.sh: pick a mode: --to-scratch-db [name] or --to-production" >&2
  echo "(run with --help for the full doc)" >&2
  exit 2
fi

# --------------------------------------------------------------------------
# Resolve the dump file (newest daily, else newest weekly, unless given)
# --------------------------------------------------------------------------
if [ -z "$DUMP_FILE" ]; then
  DUMP_FILE="$(ls -1t "$BACKUP_ROOT/daily/${DB_NAME}"_*.dump 2>/dev/null | head -n1 || true)"
  if [ -z "$DUMP_FILE" ]; then
    DUMP_FILE="$(ls -1t "$BACKUP_ROOT/weekly/${DB_NAME}"_*.dump 2>/dev/null | head -n1 || true)"
  fi
fi
if [ -z "$DUMP_FILE" ] || [ ! -f "$DUMP_FILE" ]; then
  echo "restore-postgres.sh: no dump file found (looked in $BACKUP_ROOT); pass one explicitly" >&2
  exit 2
fi
log "using dump: $DUMP_FILE"
pg_restore --list "$DUMP_FILE" > /dev/null   # fail fast on a corrupt dump

# --------------------------------------------------------------------------
# Pick and prepare the target database
# --------------------------------------------------------------------------
if [ "$MODE" = "scratch" ]; then
  TARGET_DB="${TARGET_DB:-$SCRATCH_DB_DEFAULT}"
  if [ "$TARGET_DB" = "$DB_NAME" ]; then
    echo "restore-postgres.sh: scratch db name must not be the production name" >&2
    exit 2
  fi
  log "recreating scratch database $TARGET_DB"
  psql -v ON_ERROR_STOP=1 -d postgres \
    -c "DROP DATABASE IF EXISTS \"$TARGET_DB\" WITH (FORCE);" \
    -c "CREATE DATABASE \"$TARGET_DB\" OWNER \"$DB_OWNER\";"
else
  TARGET_DB="$DB_NAME"
  echo
  echo "  *** DESTRUCTIVE RESTORE ***"
  echo "  This DROPS the live database '$DB_NAME' and rebuilds it from:"
  echo "    $DUMP_FILE"
  echo "  Active connections (including the Worker via Hyperdrive) will be"
  echo "  terminated. There is no undo beyond your other backups."
  echo
  printf "  Type the database name to proceed: "
  read -r CONFIRM
  if [ "$CONFIRM" != "$DB_NAME" ]; then
    echo "restore-postgres.sh: confirmation mismatch; aborting (nothing touched)" >&2
    exit 1
  fi
  log "dropping and recreating $DB_NAME"
  psql -v ON_ERROR_STOP=1 -d postgres \
    -c "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE);" \
    -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_OWNER\";"
fi

# --------------------------------------------------------------------------
# Restore. --no-owner + --role make ownership land on $DB_OWNER even when
# running as the postgres superuser; -1 wraps the restore in one transaction
# so a partial restore rolls back instead of leaving a half-filled database.
# --------------------------------------------------------------------------
log "restoring into $TARGET_DB"
pg_restore --no-owner --role="$DB_OWNER" --exit-on-error -1 \
  --dbname="$TARGET_DB" "$DUMP_FILE"

# --------------------------------------------------------------------------
# Sanity row counts (tolerates tables missing from older dumps)
# --------------------------------------------------------------------------
log "sanity row counts in $TARGET_DB:"
for t in "${SANITY_TABLES[@]}"; do
  COUNT="$(psql -d "$TARGET_DB" -X -A -t \
    -c "SELECT count(*) FROM $t;" 2>/dev/null || echo 'table missing')"
  printf '  %-20s %s\n' "$t" "$COUNT"
done

if [ "$MODE" = "scratch" ]; then
  log "drill restore complete. When finished inspecting, drop it with:"
  echo "  psql -d postgres -c 'DROP DATABASE \"$TARGET_DB\" WITH (FORCE);'"
  echo "Then record the drill in docs/OPS_RUNBOOK.md (Restore drill log)."
else
  log "PRODUCTION restore complete. Verify the app end to end (see runbook),"
  log "then check 'wrangler tail dungeongpt-api' for lingering DB errors."
fi
