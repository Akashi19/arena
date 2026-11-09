#!/bin/sh
# Copia de seguridad diaria de Postgres (se ejecuta dentro del contenedor "backup" de docker-compose.prod.yml).
# Restaurar: gunzip -c backups/arena-AAAAMMDD-HHMM.sql.gz | docker compose -f docker-compose.prod.yml exec -T db psql -U $POSTGRES_USER $POSTGRES_DB
set -eu
KEEP="${BACKUP_KEEP_DAYS:-14}"

while true; do
  file="/backups/arena-$(date -u +%Y%m%d-%H%M).sql.gz"
  if pg_dump --no-owner --no-privileges | gzip > "$file.tmp"; then
    mv "$file.tmp" "$file"
    echo "$(date -u +%FT%TZ) copia creada: $file"
  else
    rm -f "$file.tmp"
    echo "$(date -u +%FT%TZ) ERROR: falló pg_dump" >&2
  fi
  find /backups -name 'arena-*.sql.gz' -mtime +"$KEEP" -delete
  sleep 86400
done
