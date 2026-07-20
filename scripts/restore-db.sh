#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# restore-db.sh — Restore a PostgreSQL dump created by backup-db.sh
#
# Usage:
#   ./scripts/restore-db.sh <backup_file>
#
# Example:
#   ./scripts/restore-db.sh backups/gabschool_20250120_120000.dump.gz
#
# Reads DATABASE_URL from the environment.
# ⚠  WARNING: This will DROP and recreate all tables.
#    Always backup the target database first.
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

BACKUP_FILE="${1:-}"

if [[ -z "$BACKUP_FILE" ]]; then
  echo "Usage: $0 <backup_file>"
  exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "❌  File not found: $BACKUP_FILE"
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "❌  DATABASE_URL is not set."
  exit 1
fi

echo "⚠️  This will RESTORE to: $DATABASE_URL"
echo "   From backup: $BACKUP_FILE"
read -rp "Type 'yes' to confirm: " CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
  echo "Aborted."
  exit 0
fi

echo "🔄  Restoring database…"
gunzip -c "$BACKUP_FILE" \
  | pg_restore \
      --no-acl \
      --no-owner \
      --clean \
      --if-exists \
      --dbname="$DATABASE_URL"

echo "✅  Restore complete."
