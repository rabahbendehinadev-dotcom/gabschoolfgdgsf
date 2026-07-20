#!/bin/bash
# Run this script DIRECTLY ON THE VPS after extracting uploads-export.tar.gz
# Usage: bash vps-upload-images.sh /tmp/uploads-import/uploads
set -e

UPLOADS_DIR="${1:-/tmp/uploads-import/uploads}"

if [ ! -d "$UPLOADS_DIR" ]; then
  echo "ERROR: Directory not found: $UPLOADS_DIR"
  echo "First run:"
  echo "  tar -xzf /tmp/uploads-export.tar.gz -C /tmp/uploads-import"
  exit 1
fi

echo "=== Reading config from gabschool container ==="
# Find the gabschool API container (not db, not minio)
API_CONTAINER=$(docker ps --format "{{.Names}}" | grep -i "gabschool" | grep -iv "db" | grep -iv "minio" | head -1)

if [ -z "$API_CONTAINER" ]; then
  # Fallback: find by service/image
  API_CONTAINER=$(docker ps --format "{{.Names}}\t{{.Image}}" | grep -v "postgres\|minio\|traefik\|nginx" | grep -i "gab\|api\|server" | head -1 | awk '{print $1}')
fi

echo "API container: $API_CONTAINER"

# Extract S3 env vars
S3_ENDPOINT=$(docker inspect "$API_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^S3_ENDPOINT=' | cut -d= -f2-)
S3_BUCKET=$(docker inspect "$API_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^S3_BUCKET=' | cut -d= -f2-)
S3_KEY=$(docker inspect "$API_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^S3_ACCESS_KEY_ID=' | cut -d= -f2-)
S3_SECRET=$(docker inspect "$API_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^S3_SECRET_ACCESS_KEY=' | cut -d= -f2-)

echo "Endpoint: $S3_ENDPOINT"
echo "Bucket: $S3_BUCKET"

if [ -z "$S3_ENDPOINT" ] || [ -z "$S3_BUCKET" ] || [ -z "$S3_KEY" ]; then
  echo ""
  echo "Could not auto-detect credentials. Please set manually:"
  echo "  export S3_ENDPOINT=http://minio-service:9000"
  echo "  export S3_BUCKET=your-bucket"
  echo "  export S3_ACCESS_KEY_ID=your-key"
  echo "  export S3_SECRET_ACCESS_KEY=your-secret"
  echo "Then re-run this script."
  exit 1
fi

echo ""
echo "=== Uploading $(ls $UPLOADS_DIR | wc -l) files to MinIO ==="

FILES_OK=0
FILES_FAIL=0

for f in "$UPLOADS_DIR"/*; do
  [ -f "$f" ] || continue
  fname=$(basename "$f")
  KEY=".private/uploads/$fname"

  # Upload via S3 REST API using curl
  DATE=$(date -R)
  CONTENT_TYPE="application/octet-stream"

  RESP=$(curl -s -o /dev/null -w "%{http_code}" \
    -X PUT \
    -T "$f" \
    -H "Host: $(echo $S3_ENDPOINT | sed 's|https\?://||')" \
    -H "Date: $DATE" \
    -H "Content-Type: $CONTENT_TYPE" \
    --aws-sigv4 "aws:amz:us-east-1:s3" \
    --user "$S3_KEY:$S3_SECRET" \
    "$S3_ENDPOINT/$S3_BUCKET/$KEY" 2>/dev/null)

  if [ "$RESP" = "200" ] || [ "$RESP" = "201" ] || [ "$RESP" = "204" ]; then
    FILES_OK=$((FILES_OK + 1))
    echo -ne "\r[$FILES_OK uploaded] $fname"
  else
    FILES_FAIL=$((FILES_FAIL + 1))
    echo -e "\nFAIL ($RESP): $fname"
  fi
done

echo ""
echo ""
echo "=== DONE: $FILES_OK uploaded, $FILES_FAIL failed ==="
