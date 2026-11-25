#!/bin/sh
# Imprime las variables de Dokploy con secretos aleatorios nuevos. Uso:
#   ./infra/scripts/dokploy-env.sh [URL_WEB] [URL_API] [URL_ARCHIVOS] > infra/dokploy.env
# Copia el resultado en la pestaña "Environment" de Dokploy. No subas ese archivo a git.
set -eu
cd "$(dirname "$0")/../.."

rand() { openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-"$1"; }

WEB="${1:-http://arena-web-XXXX.traefik.me}"
API="${2:-http://arena-api-XXXX.traefik.me}"
FILES="${3:-http://arena-files-XXXX.traefik.me}"
case "$WEB" in https://*) SECURE=true ;; *) SECURE=false ;; esac

sed \
  -e "s#^PUBLIC_WEB_URL=.*#PUBLIC_WEB_URL=${WEB%/}#" \
  -e "s#^PUBLIC_API_URL=.*#PUBLIC_API_URL=${API%/}#" \
  -e "s#^PUBLIC_FILES_URL=.*#PUBLIC_FILES_URL=${FILES%/}#" \
  -e "s#^COOKIE_SECURE=.*#COOKIE_SECURE=${SECURE}#" \
  -e "s#^POSTGRES_PASSWORD=.*#POSTGRES_PASSWORD=$(rand 32)#" \
  -e "s#^JWT_ACCESS_SECRET=.*#JWT_ACCESS_SECRET=$(rand 64)#" \
  -e "s#^JWT_REFRESH_SECRET=.*#JWT_REFRESH_SECRET=$(rand 64)#" \
  -e "s#^S3_ACCESS_KEY=.*#S3_ACCESS_KEY=arena$(rand 16)#" \
  -e "s#^S3_SECRET_KEY=.*#S3_SECRET_KEY=$(rand 40)#" \
  -e "s#^SUPERADMIN_PASSWORD=.*#SUPERADMIN_PASSWORD=$(rand 20)#" \
  -e "s#^PAYMENTS_ENCRYPTION_KEY=.*#PAYMENTS_ENCRYPTION_KEY=$(openssl rand -base64 32)#" \
  infra/dokploy.env.example | grep -v '^# Genera una copia'
