#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# backup-db.sh — Dump the PostgreSQL database to a compressed file
#
# Usage:
#   ./scripts/backup-db.sh [output_file]
#
# Examples:
#   ./scripts/backup-db.sh                       # → backups/gabschool_YYYYMMDD_HHMMSS.dump.gz
#   ./scripts/backup-db.sh /tmp/before-migration.dump.gz
#
# Reads DATABASE_URL from the environment.
# Requires: pg_dump, gzip
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "❌  DATABASE_URL is not set. Source your .env file first:"
  echo "    export \$(grep -v '^#' .env | xargs)"
  exit 1
fi

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DEFAULT_OUTPUT="backups/gabschool_${TIMESTAMP}.dump.gz"
OUTPUT="${1:-$DEFAULT_OUTPUT}"

mkdir -p "$(dirname "$OUTPUT")"

echo "📦  Dumping database to: $OUTPUT"
pg_dump \
  --format=custom \
  --no-acl \
  --no-owner \
  "$DATABASE_URL" \
  | gzip > "$OUTPUT"

SIZE=$(du -h "$OUTPUT" | cut -f1)
echo "✅  Backup complete: $OUTPUT ($SIZE)"
