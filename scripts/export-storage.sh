#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# export-storage.sh — Export all files from Replit Object Storage to local disk
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

OUTPUT_DIR="${1:-./storage-export}"

BUCKET_ID="${DEFAULT_OBJECT_STORAGE_BUCKET_ID:-}"
if [[ -z "$BUCKET_ID" ]]; then
  echo "❌  DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set."
  exit 1
fi

echo "📦  Exporting Replit Object Storage → $OUTPUT_DIR"
echo "🪣  Bucket: $BUCKET_ID"
echo ""

mkdir -p "$OUTPUT_DIR"

SCRIPT="$(dirname "$0")/../artifacts/api-server/scripts/export-storage-sdk.ts"
TSX="./artifacts/api-server/node_modules/.bin/tsx"

"$TSX" "$SCRIPT" "$OUTPUT_DIR" "$BUCKET_ID"
