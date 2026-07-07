#!/usr/bin/env bash
#
# backup-postgres.sh - nightly pg_dump of the DungeonGPT production database.
# Backlog #20. See docs/OPS_RUNBOOK.md ("Backups") for install (cron or systemd
# timer), the offsite rclone/R2 recipe, and the monthly restore drill.
#
# WHERE IT RUNS: on the database box itself (the games box; alias in your local ssh config), scheduled by
# cron or a systemd timer, ideally as the `postgres` OS user so peer auth works
# and no password is needed. It is NOT run from CI and never from a laptop.
#
# WHAT IT DOES:
#   1. pg_dump the `dungeongpt` database in custom format (-Fc: compressed,
#      restorable table-by-table with pg_restore) to $BACKUP_ROOT/daily/,
#      timestamped, written to a .part file and only renamed once pg_restore
#      can list its table of contents (so a truncated dump never looks valid).
#   2. Once per ISO week (on WEEKLY_DOW), hardlink the fresh daily into
#      $BACKUP_ROOT/weekly/ so weeklies survive daily pruning at no disk cost.
#   3. Prune: dailies older than DAILY_KEEP_DAYS, weeklies older than
#      WEEKLY_KEEP_WEEKS.
#   4. If offsite replication is enabled (--offsite flag or OFFSITE=1), copy
#      new dumps to an rclone remote (R2 or any S3-compatible bucket) and
#      age-prune the remote with the same windows. `rclone copy` + aged
#      `rclone delete` is used instead of `rclone sync` on purpose: a wiped
#      local disk can never cascade into a wiped remote.
#
# SECRETS: none inline. If the script does need credentials (running as a user
# other than postgres, or a remote PGHOST), put standard PG* variables in
# $ENV_FILE (default /etc/dungeongpt/backup.env), owned by the runtime user,
# chmod 600. rclone credentials live in the rclone config file, also chmod 600.
#
# USAGE:
#   backup-postgres.sh            # dump + prune, local only
#   backup-postgres.sh --offsite  # dump + prune + replicate to $RCLONE_REMOTE
#
set -euo pipefail

# --------------------------------------------------------------------------
# Tunables (override via environment or $ENV_FILE; flags beat both)
# --------------------------------------------------------------------------
DB_NAME="${DB_NAME:-dungeongpt}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/dungeongpt}"
DAILY_KEEP_DAYS="${DAILY_KEEP_DAYS:-14}"     # keep N daily dumps
WEEKLY_KEEP_WEEKS="${WEEKLY_KEEP_WEEKS:-8}"  # keep M weekly dumps
WEEKLY_DOW="${WEEKLY_DOW:-7}"                # ISO day for the weekly copy (7 = Sunday)
ENV_FILE="${ENV_FILE:-/etc/dungeongpt/backup.env}"
OFFSITE="${OFFSITE:-0}"
RCLONE_REMOTE="${RCLONE_REMOTE:-r2:dungeongpt-backups}"  # remote:bucket[/prefix]

for arg in "$@"; do
  case "$arg" in
    --offsite) OFFSITE=1 ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "backup-postgres.sh: unknown argument: $arg" >&2; exit 2 ;;
  esac
done

# Optional env file for credentials/overrides (PGHOST, PGUSER, PGPASSWORD, ...).
# Must be chmod 600; refuse a world-readable one rather than use it.
if [ -f "$ENV_FILE" ]; then
  if [ "$(stat -c '%a' "$ENV_FILE" | rev | cut -c1)" != "0" ]; then
    echo "backup-postgres.sh: $ENV_FILE is world-accessible; chmod 600 it first" >&2
    exit 2
  fi
  # shellcheck source=/dev/null
  . "$ENV_FILE"
fi

DAILY_DIR="$BACKUP_ROOT/daily"
WEEKLY_DIR="$BACKUP_ROOT/weekly"
mkdir -p "$DAILY_DIR" "$WEEKLY_DIR"

STAMP="$(date +%F_%H%M%S)"
DUMP="$DAILY_DIR/${DB_NAME}_${STAMP}.dump"

log() { echo "[backup-postgres] $(date -Is) $*"; }

# --------------------------------------------------------------------------
# 1. Dump (custom format), verify, then atomically rename into place
# --------------------------------------------------------------------------
log "dumping $DB_NAME -> $DUMP"
pg_dump --format=custom --dbname="$DB_NAME" --file="$DUMP.part"

# A dump pg_restore cannot read is not a backup. --list parses the whole TOC.
pg_restore --list "$DUMP.part" > /dev/null
mv "$DUMP.part" "$DUMP"
log "dump ok ($(du -h "$DUMP" | cut -f1))"

# --------------------------------------------------------------------------
# 2. Weekly promotion (hardlink; falls back to copy across filesystems)
# --------------------------------------------------------------------------
if [ "$(date +%u)" -eq "$WEEKLY_DOW" ]; then
  WEEKLY_TAG="$(date +%G-W%V)"  # ISO year-week, e.g. 2026-W27
  WEEKLY_FILE="$WEEKLY_DIR/${DB_NAME}_${WEEKLY_TAG}.dump"
  if [ ! -e "$WEEKLY_FILE" ]; then
    ln "$DUMP" "$WEEKLY_FILE" 2>/dev/null || cp "$DUMP" "$WEEKLY_FILE"
    log "weekly promoted: $WEEKLY_FILE"
  fi
fi

# --------------------------------------------------------------------------
# 3. Local retention pruning
# --------------------------------------------------------------------------
find "$DAILY_DIR"  -name "${DB_NAME}_*.dump" -type f -mtime "+$DAILY_KEEP_DAYS" -print -delete \
  | while read -r f; do log "pruned daily: $f"; done
find "$WEEKLY_DIR" -name "${DB_NAME}_*.dump" -type f -mtime "+$((WEEKLY_KEEP_WEEKS * 7))" -print -delete \
  | while read -r f; do log "pruned weekly: $f"; done
# Clean up any stale .part files from previous interrupted runs (>1 day old).
find "$BACKUP_ROOT" -name '*.part' -type f -mtime +1 -delete

# --------------------------------------------------------------------------
# 4. Offsite replication (rclone copy, never sync; remote pruned by age only)
# --------------------------------------------------------------------------
if [ "$OFFSITE" = "1" ]; then
  command -v rclone > /dev/null || { echo "backup-postgres.sh: rclone not installed" >&2; exit 2; }
  log "offsite: copying to $RCLONE_REMOTE"
  rclone copy "$DAILY_DIR"  "$RCLONE_REMOTE/daily"  --include "${DB_NAME}_*.dump"
  rclone copy "$WEEKLY_DIR" "$RCLONE_REMOTE/weekly" --include "${DB_NAME}_*.dump"
  # Age-based remote pruning mirrors local retention. --min-age means "only
  # delete objects OLDER than this"; a fresh or even empty local dir can never
  # trigger deletion of recent remote dumps.
  rclone delete "$RCLONE_REMOTE/daily"  --min-age "${DAILY_KEEP_DAYS}d"
  rclone delete "$RCLONE_REMOTE/weekly" --min-age "$((WEEKLY_KEEP_WEEKS * 7))d"
  log "offsite: done"
fi

log "backup complete: $DUMP"
