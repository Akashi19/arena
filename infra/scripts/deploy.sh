#!/bin/sh
# Despliegue o actualización en el servidor. Uso:
#   ./infra/scripts/deploy.sh                 # imágenes de GHCR con IMAGE_TAG (por defecto latest)
#   IMAGE_TAG=<sha> ./infra/scripts/deploy.sh # versión concreta (también sirve para volver atrás)
#   BUILD=1 ./infra/scripts/deploy.sh         # construye las imágenes en el servidor en vez de descargarlas
set -eu
cd "$(dirname "$0")/../.."

ENV_FILE=infra/.env.production
[ -f "$ENV_FILE" ] || { echo "Falta $ENV_FILE (copia infra/.env.production.example)"; exit 1; }
[ -f apps/api/.env.production ] || { echo "Falta apps/api/.env.production (copia apps/api/.env.production.example)"; exit 1; }

compose() { docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml "$@"; }

mkdir -p backups
if [ "${BUILD:-0}" = "1" ]; then
  compose build
else
  compose pull db migrate api web caddy backup
fi

# Copia previa a las migraciones (si la base ya existe)
if compose ps --status running db | grep -q db; then
  # shellcheck disable=SC2016  # las variables se expanden dentro del contenedor de Postgres
  compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" --no-owner "$POSTGRES_DB"' | gzip > "backups/pre-deploy-$(date -u +%Y%m%d-%H%M).sql.gz"
fi

compose up -d --remove-orphans
compose ps
echo "Comprobando salud…"
for _ in $(seq 1 30); do
  if compose exec -T api wget -qO- http://127.0.0.1:4100/api/health >/dev/null 2>&1; then
    echo "API en línea."; exit 0
  fi
  sleep 2
done
echo "La API no respondió: revisa 'docker compose -f docker-compose.prod.yml logs api migrate'" >&2
exit 1
