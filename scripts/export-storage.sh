#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# export-storage.sh — Export all files from Replit Object Storage to local disk
#
# Run this script ON REPLIT before migrating to VPS.
#
# Usage:
#   ./scripts/export-storage.sh [output_dir]
#
# Example:
#   ./scripts/export-storage.sh ./storage-export
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

OUTPUT_DIR="${1:-./storage-export}"

BUCKET_ID="${DEFAULT_OBJECT_STORAGE_BUCKET_ID:-}"
if [[ -z "$BUCKET_ID" ]]; then
  echo "❌  DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set."
  echo "    This script must run on Replit where the sidecar is available."
  exit 1
fi

echo "📦  Exporting Replit Object Storage → $OUTPUT_DIR"
echo "🪣  Bucket: $BUCKET_ID"
echo ""

mkdir -p "$OUTPUT_DIR"

# Use the TypeScript SDK script (works on Replit with the GCS Sidecar)
npx --yes tsx \
  "$(dirname "$0")/../artifacts/api-server/scripts/export-storage-sdk.ts" \
  "$OUTPUT_DIR" \
  "$BUCKET_ID"
