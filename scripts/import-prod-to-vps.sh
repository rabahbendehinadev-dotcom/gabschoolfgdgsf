#!/bin/bash
set -e

VPS_IP="2.24.13.63"
VPS_USER="root"
SQL_FILE="backups/prod_full_export.sql.gz"
DB_USER="gabuser"
DB_NAME="gabschool"
DB_PASS="BuTh7jiGiuvXmSo2Wt0c"

echo "=== Step 1: Transfer production export to VPS ==="
scp "$SQL_FILE" "$VPS_USER@$VPS_IP:/tmp/prod_export.sql.gz"
echo "Transfer done."

echo ""
echo "=== Step 2: Import into VPS database ==="
ssh "$VPS_USER@$VPS_IP" bash << EOF
set -e

CONTAINER=\$(docker ps --filter "name=gabschooldb" --format "{{.Names}}" | head -1)
echo "Container: \$CONTAINER"

# Decompress and copy into container
gunzip -f /tmp/prod_export.sql.gz
docker cp /tmp/prod_export.sql "\$CONTAINER:/tmp/prod_export.sql"

# Run the import
docker exec "\$CONTAINER" bash -c "
  PGPASSWORD='$DB_PASS' psql -U $DB_USER -d $DB_NAME -f /tmp/prod_export.sql
" 2>&1 | grep -E "^(ERROR|NOTICE|--)" | head -30

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
      (SELECT COUNT(*) FROM tools) as tools;
  \"
"

# Cleanup
rm -f /tmp/prod_export.sql
docker exec "\$CONTAINER" rm -f /tmp/prod_export.sql
echo ""
echo "=== DONE! Production data imported ==="
EOF
