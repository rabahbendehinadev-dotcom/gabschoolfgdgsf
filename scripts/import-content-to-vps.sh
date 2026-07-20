#!/bin/bash
set -e

VPS_IP="2.24.13.63"
VPS_USER="root"
SQL_FILE="backups/content_import_v3.sql.gz"
DB_USER="gabuser"
DB_NAME="gabschool"
DB_PASS="BuTh7jiGiuvXmSo2Wt0c"

echo "=== Transfer content import v3 to VPS ==="
scp "$SQL_FILE" "$VPS_USER@$VPS_IP:/tmp/content_import_v3.sql.gz"
echo "Transfer done."

echo ""
echo "=== Import categories + playlists + videos ==="
ssh "$VPS_USER@$VPS_IP" bash << EOF
set -e

CONTAINER=\$(docker ps --filter "name=gabschooldb" --format "{{.Names}}" | head -1)
echo "Container: \$CONTAINER"

gunzip -f /tmp/content_import_v3.sql.gz
docker cp /tmp/content_import_v3.sql "\$CONTAINER:/tmp/content_import_v3.sql"

echo "Running import..."
docker exec "\$CONTAINER" bash -c "
  PGPASSWORD='$DB_PASS' psql -U $DB_USER -d $DB_NAME \
    -v ON_ERROR_STOP=on \
    -f /tmp/content_import_v3.sql
" 2>&1

echo ""
echo "=== Verify ==="
docker exec "\$CONTAINER" bash -c "
  PGPASSWORD='$DB_PASS' psql -U $DB_USER -d $DB_NAME -c \"
    SELECT
      (SELECT COUNT(*) FROM categories) as categories,
      (SELECT COUNT(*) FROM playlists) as playlists,
      (SELECT COUNT(*) FROM videos) as videos;
  \"
"

rm -f /tmp/content_import_v3.sql
docker exec "\$CONTAINER" rm -f /tmp/content_import_v3.sql
echo "=== DONE ==="
EOF
