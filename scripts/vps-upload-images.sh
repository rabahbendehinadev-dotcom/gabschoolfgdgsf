#!/bin/bash
# Run this DIRECTLY ON THE VPS as root
# It reads MinIO credentials from the MinIO container and uploads uploads-export.tar.gz
set -e

TAR_FILE="/tmp/uploads-export.tar.gz"
IMPORT_DIR="/tmp/uploads-import"

echo "=== Step 1: Find MinIO container ==="
MINIO_CONTAINER=$(docker ps --format "{{.Names}}" | grep -i minio | head -1)
if [ -z "$MINIO_CONTAINER" ]; then
  echo "ERROR: MinIO container not found. Running containers:"
  docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}"
  exit 1
fi
echo "MinIO container: $MINIO_CONTAINER"

echo ""
echo "=== Step 2: Get MinIO credentials ==="
MINIO_USER=$(docker inspect "$MINIO_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^MINIO_ROOT_USER=' | cut -d= -f2-)
MINIO_PASS=$(docker inspect "$MINIO_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^MINIO_ROOT_PASSWORD=' | cut -d= -f2-)

if [ -z "$MINIO_USER" ]; then
  echo "MINIO_ROOT_USER not found, trying minioadmin defaults..."
  MINIO_USER="minioadmin"
  MINIO_PASS="minioadmin"
fi
echo "User: $MINIO_USER"

echo ""
echo "=== Step 3: Find MinIO port ==="
MINIO_PORT=$(docker port "$MINIO_CONTAINER" 9000/tcp 2>/dev/null | grep -o ':[0-9]*' | tr -d ':' | head -1)
if [ -z "$MINIO_PORT" ]; then
  MINIO_PORT="9000"
fi
MINIO_URL="http://localhost:$MINIO_PORT"
echo "MinIO URL: $MINIO_URL"

echo ""
echo "=== Step 4: Install mc (MinIO client) ==="
if [ ! -f /tmp/mc ]; then
  echo "Downloading mc..."
  curl -sSL https://dl.min.io/client/mc/release/linux-amd64/mc -o /tmp/mc
  chmod +x /tmp/mc
fi

echo ""
echo "=== Step 5: Configure mc alias ==="
/tmp/mc alias set vps "$MINIO_URL" "$MINIO_USER" "$MINIO_PASS" --insecure 2>&1

echo ""
echo "=== Step 6: Find bucket ==="
BUCKET=$(/tmp/mc ls vps/ --insecure 2>/dev/null | awk '{print $NF}' | tr -d '/' | head -1)
if [ -z "$BUCKET" ]; then
  echo "No bucket found. Creating default bucket 'uploads'..."
  BUCKET="uploads"
  /tmp/mc mb "vps/$BUCKET" --insecure 2>/dev/null || true
fi
echo "Bucket: $BUCKET"

echo ""
echo "=== Step 7: Extract archive ==="
if [ ! -f "$TAR_FILE" ]; then
  echo "ERROR: $TAR_FILE not found. Please transfer the archive first:"
  echo "  scp backups/uploads-export.tar.gz root@VPS_IP:/tmp/"
  exit 1
fi
rm -rf "$IMPORT_DIR"
mkdir -p "$IMPORT_DIR"
tar -xzf "$TAR_FILE" -C "$IMPORT_DIR"
FILE_COUNT=$(ls "$IMPORT_DIR/uploads/" 2>/dev/null | wc -l)
echo "Files extracted: $FILE_COUNT"

echo ""
echo "=== Step 8: Upload to MinIO ==="
/tmp/mc cp --recursive "$IMPORT_DIR/uploads/" "vps/$BUCKET/.private/uploads/" --insecure 2>&1

echo ""
echo "=== Verify ==="
UPLOADED=$(/tmp/mc ls "vps/$BUCKET/.private/uploads/" --insecure 2>/dev/null | wc -l)
echo "Objects in MinIO: $UPLOADED"

# Cleanup
rm -rf "$IMPORT_DIR"
echo ""
echo "=== DONE ==="
