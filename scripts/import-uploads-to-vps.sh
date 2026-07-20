#!/bin/bash
# Migrates image uploads from Replit App Storage to VPS MinIO
set -e

VPS_IP="2.24.13.63"
VPS_USER="root"
TAR_FILE="/tmp/uploads-export.tar.gz"

if [ ! -f "$TAR_FILE" ]; then
  echo "ERROR: $TAR_FILE not found. Run the download step first."
  exit 1
fi

echo "=== Transfer uploads archive to VPS ==="
scp "$TAR_FILE" "$VPS_USER@$VPS_IP:/tmp/uploads-export.tar.gz"
echo "Transfer done. Size: $(ls -lh $TAR_FILE | awk '{print $5}')"

echo ""
echo "=== Import uploads into VPS MinIO ==="
ssh "$VPS_USER@$VPS_IP" bash << 'REMOTEOF'
set -e

# Find MinIO container
MINIO_CONTAINER=$(docker ps --filter "name=minio" --format "{{.Names}}" | head -1)
echo "MinIO container: $MINIO_CONTAINER"

# Find API container to read env vars
API_CONTAINER=$(docker ps --format "{{.Names}}" | grep -v minio | grep -v db | grep -v nginx | grep -v traefik | head -1)
echo "API container: $API_CONTAINER"

# Extract MinIO credentials from the API container env
MINIO_ENDPOINT=$(docker inspect "$API_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^(S3_ENDPOINT|MINIO_ENDPOINT)=' | head -1 | cut -d= -f2-)
S3_BUCKET=$(docker inspect "$API_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^(S3_BUCKET|MINIO_BUCKET|OBJECT_STORAGE_BUCKET)=' | head -1 | cut -d= -f2-)
ACCESS_KEY=$(docker inspect "$API_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^(S3_ACCESS_KEY_ID|MINIO_ROOT_USER|AWS_ACCESS_KEY_ID)=' | head -1 | cut -d= -f2-)
SECRET_KEY=$(docker inspect "$API_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -E '^(S3_SECRET_ACCESS_KEY|MINIO_ROOT_PASSWORD|AWS_SECRET_ACCESS_KEY)=' | head -1 | cut -d= -f2-)

echo "MinIO endpoint: $MINIO_ENDPOINT"
echo "Bucket: $S3_BUCKET"

# Extract the archive
echo ""
echo "Extracting archive..."
mkdir -p /tmp/uploads-import
tar -xzf /tmp/uploads-export.tar.gz -C /tmp/uploads-import
echo "Files extracted:"
ls /tmp/uploads-import/uploads/ | wc -l

# Copy files into MinIO container and upload
echo ""
echo "Uploading to MinIO..."
docker cp /tmp/uploads-import/uploads/. "$MINIO_CONTAINER:/tmp/uploads-to-import/"

# Use mc inside MinIO container to upload
docker exec "$MINIO_CONTAINER" sh -c "
  mc alias set local http://localhost:9000 '\$MINIO_ROOT_USER' '\$MINIO_ROOT_PASSWORD' 2>/dev/null || true
  mc alias set local http://localhost:9000 minioadmin minioadmin 2>/dev/null || true
  BUCKET=\$(mc ls local/ 2>/dev/null | awk '{print \$NF}' | head -1 | tr -d '/')
  echo 'Bucket:' \$BUCKET
  mc cp --recursive /tmp/uploads-to-import/ local/\$BUCKET/.private/uploads/ 2>&1 | tail -5
  echo 'Objects in bucket:'
  mc ls local/\$BUCKET/.private/uploads/ 2>/dev/null | wc -l
"

# Cleanup
rm -rf /tmp/uploads-import /tmp/uploads-export.tar.gz
docker exec "$MINIO_CONTAINER" rm -rf /tmp/uploads-to-import
echo ""
echo "=== DONE: Images migrated to VPS MinIO ==="
REMOTEOF
