#!/bin/bash
set -e

VPS_IP="2.24.13.63"
VPS_USER="root"
DUMP_FILE="onlinegab_replit_full.dump"
DB_USER="gabuser"
DB_NAME="gabschool"
DB_PASS="BuTh7jiGiuvXmSo2Wt0c"
REMOTE_DUMP="/tmp/gabschool_restore.dump"

echo "=== Step 1: Transfer dump to VPS ==="
scp "$DUMP_FILE" "$VPS_USER@$VPS_IP:$REMOTE_DUMP"
echo "Transfer done."

echo ""
echo "=== Step 2: Restore on VPS ==="
ssh "$VPS_USER@$VPS_IP" bash << EOF
set -e

CONTAINER=\$(docker ps --filter "name=gabschooldb" --format "{{.Names}}" | head -1)

if [ -z "\$CONTAINER" ]; then
  echo "ERROR: PostgreSQL container not found!"
  docker ps --format "{{.Names}}"
  exit 1
fi

echo "Found container: \$CONTAINER"

docker cp $REMOTE_DUMP "\$CONTAINER:/tmp/restore.dump"

docker exec "\$CONTAINER" bash -c "
  PGPASSWORD='$DB_PASS' pg_restore \
    --username='$DB_USER' \
    --dbname='$DB_NAME' \
    --clean \
    --if-exists \
    --no-owner \
    --no-acl \
    --verbose \
    /tmp/restore.dump
" 2>&1 | tail -30

echo ""
echo "=== Verify: counting rows ==="
docker exec "\$CONTAINER" bash -c "
  PGPASSWORD='$DB_PASS' psql -U $DB_USER -d $DB_NAME -c \"
    SELECT
      (SELECT COUNT(*) FROM users) as users,
      (SELECT COUNT(*) FROM videos) as videos,
      (SELECT COUNT(*) FROM playlists) as playlists,
      (SELECT COUNT(*) FROM categories) as categories,
      (SELECT COUNT(*) FROM subscription_plans) as plans;
  \"
"

rm -f $REMOTE_DUMP
docker exec "\$CONTAINER" rm -f /tmp/restore.dump
echo ""
echo "=== DONE! Database migrated successfully ==="
EOF
