#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# export-storage.sh — Export all files from Replit Object Storage to local disk
#
# Run this script ON REPLIT before migrating to VPS.
# It downloads every object from the Replit/GCS bucket to ./storage-export/
# preserving the full object path as the local file structure.
#
# Usage (run on Replit):
#   pnpm --filter @workspace/api-server run tsx scripts/export-storage.sh
#   # or directly:
#   npx tsx artifacts/api-server/scripts/export-storage.ts
#
# After export, copy the storage-export/ directory to your VPS:
#   rsync -avz storage-export/ vps-user@your-server:/app/storage-export/
#   # then run: ./scripts/import-storage-s3.sh
#
# Requires: PRIVATE_OBJECT_DIR, PUBLIC_OBJECT_SEARCH_PATHS, DEFAULT_OBJECT_STORAGE_BUCKET_ID
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

OUTPUT_DIR="${1:-./storage-export}"

echo "📦  Exporting Replit Object Storage → $OUTPUT_DIR"
echo "    Run this script on Replit, then rsync the directory to your VPS."
echo ""

mkdir -p "$OUTPUT_DIR"

# We use gsutil (available in the Replit environment) to download objects.
# The Replit GCS Sidecar at port 1106 provides the credentials.
export STORAGE_EMULATOR_HOST="http://127.0.0.1:1106"

BUCKET_ID="${DEFAULT_OBJECT_STORAGE_BUCKET_ID:-}"
if [[ -z "$BUCKET_ID" ]]; then
  echo "❌  DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set."
  echo "    This script must run on Replit where the sidecar is available."
  exit 1
fi

echo "🪣  Bucket: $BUCKET_ID"

# Download all objects (gsutil preserves directory structure)
gsutil -m cp -r "gs://${BUCKET_ID}/**" "$OUTPUT_DIR/" 2>&1 || {
  # Alternative: use the Replit Object Storage web SDK
  echo "⚠️  gsutil not available — trying npx tsx download instead…"
  npx tsx "$(dirname "$0")/export-storage-sdk.ts" "$OUTPUT_DIR" "$BUCKET_ID"
}

FILE_COUNT=$(find "$OUTPUT_DIR" -type f | wc -l | tr -d ' ')
echo ""
echo "✅  Export complete: $FILE_COUNT files in $OUTPUT_DIR"
echo ""
echo "Next step — copy to VPS:"
echo "  rsync -avz --progress $OUTPUT_DIR/ vps-user@your-vps:/app/storage-export/"
echo "  # then on the VPS:"
echo "  ./scripts/import-storage-s3.sh /app/storage-export"
