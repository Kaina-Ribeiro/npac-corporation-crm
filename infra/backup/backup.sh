#!/bin/sh
# Dump diário do banco (formato custom, restaurável com pg_restore) e retenção local.
set -eu
stamp=$(date -u +%Y%m%dT%H%M%SZ)
file="/backups/npac-$stamp.dump"
pg_dump --format=custom --no-owner --file="$file.partial"
mv "$file.partial" "$file"
find /backups -name 'npac-*.dump' -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete
echo "backup ok: $(basename "$file") ($(du -h "$file" | cut -f1))"
