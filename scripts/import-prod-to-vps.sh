#!/bin/bash
set -e

VPS_IP="2.24.13.63"
VPS_USER="root"
SQL_FILE="backups/prod_full_export_v2.sql.gz"
DB_USER="gabuser"
DB_NAME="gabschool"
DB_PASS="BuTh7jiGiuvXmSo2Wt0c"

echo "=== Step 1: Transfer production export to VPS ==="
scp "$SQL_FILE" "$VPS_USER@$VPS_IP:/tmp/prod_export_v2.sql.gz"
echo "Transfer done."

echo ""
echo "=== Step 2: Import into VPS database ==="
ssh "$VPS_USER@$VPS_IP" bash << EOF
set -e

CONTAINER=\$(docker ps --filter "name=gabschooldb" --format "{{.Names}}" | head -1)
echo "Container: \$CONTAINER"

gunzip -f /tmp/prod_export_v2.sql.gz
docker cp /tmp/prod_export_v2.sql "\$CONTAINER:/tmp/prod_export_v2.sql"

echo "Running import (this may take a minute)..."
docker exec "\$CONTAINER" bash -c "
  PGPASSWORD='$DB_PASS' psql -U $DB_USER -d $DB_NAME \
    -v ON_ERROR_CONTINUE=on \
    -f /tmp/prod_export_v2.sql 2>&1
" | grep -E "^(ERROR)" | head -20 || true

echo ""
echo "=== Verify row counts ==="
docker exec "\$CONTAINER" bash -c "
  PGPASSWORD='$DB_PASS' psql -U $DB_USER -d $DB_NAME -c \"
    SELECT
      (SELECT COUNT(*) FROM users) as users,
      (SELECT COUNT(*) FROM users WHERE account_type='vip') as vip,
      (SELECT COUNT(*) FROM videos) as videos,
      (SELECT COUNT(*) FROM categories) as categories,
      (SELECT COUNT(*) FROM playlists) as playlists,
      (SELECT COUNT(*) FROM tools) as tools,
      (SELECT COUNT(*) FROM user_courses) as user_courses;
  \"
"

rm -f /tmp/prod_export_v2.sql
docker exec "\$CONTAINER" rm -f /tmp/prod_export_v2.sql
echo ""
echo "=== DONE ==="
EOF
