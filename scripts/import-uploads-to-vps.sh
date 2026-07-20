#!/bin/bash
# Migrates image uploads from Replit App Storage to VPS MinIO
set -e

VPS_IP="2.24.13.63"
VPS_USER="root"
TAR_FILE="backups/uploads-export.tar.gz"

if [ ! -f "$TAR_FILE" ]; then
  echo "ERROR: $TAR_FILE not found."
  exit 1
fi

echo "=== Transfer uploads archive to VPS ==="
scp "$TAR_FILE" "$VPS_USER@$VPS_IP:/tmp/uploads-export.tar.gz"
echo "Transfer done. Size: $(ls -lh $TAR_FILE | awk '{print $5}')"

echo ""
echo "=== Import uploads into VPS MinIO ==="
ssh "$VPS_USER@$VPS_IP" bash << 'REMOTEOF'
set -e

# Find MinIO container (has "minio" in name)
MINIO_CONTAINER=$(docker ps --filter "name=minio" --format "{{.Names}}" | head -1)
echo "MinIO container: $MINIO_CONTAINER"

# Get MinIO root credentials from the MinIO container itself
MINIO_USER=$(docker inspect "$MINIO_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^MINIO_ROOT_USER=' | cut -d= -f2-)
MINIO_PASS=$(docker inspect "$MINIO_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^MINIO_ROOT_PASSWORD=' | cut -d= -f2-)
echo "MinIO user: $MINIO_USER"

# Find MinIO internal port
MINIO_PORT=$(docker inspect "$MINIO_CONTAINER" --format '{{range $k,$v := .NetworkSettings.Ports}}{{$k}}{{end}}' | grep -o '9000' | head -1)
MINIO_PORT=${MINIO_PORT:-9000}
MINIO_ENDPOINT="http://localhost:$MINIO_PORT"
echo "MinIO endpoint: $MINIO_ENDPOINT (via docker network)"

# Use port-forwarding via docker exec to reach MinIO
# Find bucket name from env or default
GABSCHOOL_CONTAINER=$(docker ps --filter "name=gabschool" --format "{{.Names}}" | grep -v db | grep -v minio | head -1)
echo "App container: $GABSCHOOL_CONTAINER"

S3_BUCKET=$(docker inspect "$GABSCHOOL_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep '^S3_BUCKET=' | cut -d= -f2-)
S3_ENDPOINT=$(docker inspect "$GABSCHOOL_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep '^S3_ENDPOINT=' | cut -d= -f2-)
S3_KEY=$(docker inspect "$GABSCHOOL_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep '^S3_ACCESS_KEY_ID=' | cut -d= -f2-)
S3_SECRET=$(docker inspect "$GABSCHOOL_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep '^S3_SECRET_ACCESS_KEY=' | cut -d= -f2-)

echo "S3 bucket: $S3_BUCKET"
echo "S3 endpoint: $S3_ENDPOINT"

# Extract the archive
echo ""
echo "Extracting archive..."
rm -rf /tmp/uploads-import
mkdir -p /tmp/uploads-import
tar -xzf /tmp/uploads-export.tar.gz -C /tmp/uploads-import
echo "Files extracted: $(ls /tmp/uploads-import/uploads/ | wc -l)"

# Upload using aws CLI inside the API container (it has aws-sdk)
# Or use curl to PUT files directly to MinIO S3 API from the MinIO container
echo ""
echo "Uploading files using MinIO container mc or aws..."

# Try using aws CLI on the VPS host directly
if command -v aws &>/dev/null; then
  echo "Using aws CLI on host"
  export AWS_ACCESS_KEY_ID="${S3_KEY:-$MINIO_USER}"
  export AWS_SECRET_ACCESS_KEY="${S3_SECRET:-$MINIO_PASS}"
  export AWS_DEFAULT_REGION="us-east-1"

  # Get MinIO host from S3_ENDPOINT or use container network
  ENDPOINT="${S3_ENDPOINT}"
  
  aws s3 sync /tmp/uploads-import/uploads/ "s3://${S3_BUCKET}/.private/uploads/" \
    --endpoint-url "$ENDPOINT" \
    --no-verify-ssl \
    --quiet 2>&1
  
  echo "Objects uploaded:"
  aws s3 ls "s3://${S3_BUCKET}/.private/uploads/" --endpoint-url "$ENDPOINT" --no-verify-ssl 2>/dev/null | wc -l
else
  echo "aws CLI not found on host. Trying docker exec in MinIO container..."
  # Copy files into MinIO container data directory directly
  # MinIO stores data at /data by default
  docker exec "$MINIO_CONTAINER" mkdir -p /data/${S3_BUCKET}/.private/uploads/
  
  for f in /tmp/uploads-import/uploads/*; do
    fname=$(basename "$f")
    docker cp "$f" "$MINIO_CONTAINER:/data/${S3_BUCKET}/.private/uploads/$fname"
  done
  
  # Force MinIO to rescan (restart or use mc if available)
  docker exec "$MINIO_CONTAINER" sh -c "mc alias set local http://localhost:9000 '${MINIO_USER}' '${MINIO_PASS}' 2>/dev/null && mc ls local/${S3_BUCKET}/.private/uploads/ 2>/dev/null | wc -l || echo 'mc not available, files copied directly'"
fi

# Cleanup
rm -rf /tmp/uploads-import /tmp/uploads-export.tar.gz
echo ""
echo "=== DONE ==="
REMOTEOF
