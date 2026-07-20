#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# import-storage-s3.sh — Upload the exported Replit storage to an S3-compatible
#                         bucket (MinIO, AWS S3, Cloudflare R2, Wasabi, etc.)
#
# Run this script ON THE VPS after copying storage-export/ from Replit.
#
# Usage:
#   ./scripts/import-storage-s3.sh [source_dir]
#
# Example:
#   ./scripts/import-storage-s3.sh /app/storage-export
#
# Required env vars (read from .env):
#   S3_BUCKET, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY
#
# Requires: aws CLI (s3 subcommand) — works with MinIO via --endpoint-url
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SOURCE_DIR="${1:-./storage-export}"

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "❌  Source directory not found: $SOURCE_DIR"
  echo "    Run export-storage.sh on Replit first, then rsync the directory here."
  exit 1
fi

for VAR in S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY; do
  if [[ -z "${!VAR:-}" ]]; then
    echo "❌  $VAR is not set. Source your .env first:"
    echo "    export \$(grep -v '^#' .env | xargs)"
    exit 1
  fi
done

BUCKET="${S3_BUCKET}"
REGION="${S3_REGION:-us-east-1}"
ENDPOINT="${S3_ENDPOINT:-}"
ENDPOINT_FLAG=""
if [[ -n "$ENDPOINT" ]]; then
  ENDPOINT_FLAG="--endpoint-url $ENDPOINT"
fi

export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="$REGION"

echo "🚀  Uploading storage files to S3"
echo "    Source : $SOURCE_DIR"
echo "    Bucket : s3://$BUCKET"
if [[ -n "$ENDPOINT" ]]; then
  echo "    Endpoint: $ENDPOINT"
fi
echo ""

FILE_COUNT=$(find "$SOURCE_DIR" -type f | wc -l | tr -d ' ')
echo "📁  Files to upload: $FILE_COUNT"
echo ""

aws s3 sync "$SOURCE_DIR/" "s3://${BUCKET}/" \
  $ENDPOINT_FLAG \
  --storage-class STANDARD \
  --no-progress \
  2>&1

UPLOADED=$(aws s3 ls "s3://${BUCKET}/" $ENDPOINT_FLAG --recursive | wc -l | tr -d ' ')
echo ""
echo "✅  Import complete. Objects in bucket: $UPLOADED"
echo ""
echo "Next steps:"
echo "  1. Set STORAGE_PROVIDER=s3 in your .env"
echo "  2. Set S3_BUCKET=$BUCKET"
echo "  3. Update PRIVATE_OBJECT_DIR and PUBLIC_OBJECT_SEARCH_PATHS to match the S3 key prefix"
echo "  4. Start the app: docker compose up -d"
