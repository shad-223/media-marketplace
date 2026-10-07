#!/usr/bin/env bash
# Nightly Postgres + uploads backup for Media. Keeps 14 days. Cron: 30 3 * * * bash /opt/media/deploy/backup.sh
set -euo pipefail
DIR=/opt/media-backups
mkdir -p "$DIR"
TS=$(date +%Y%m%d-%H%M)
cd /opt/media
docker compose -p media exec -T db pg_dump -U media -d media | gzip > "$DIR/db-$TS.sql.gz"
docker run --rm -v media_uploads:/data -v "$DIR":/out alpine tar czf "/out/uploads-$TS.tgz" -C /data .
find "$DIR" -type f -mtime +14 -delete
echo "backup ok $TS"
