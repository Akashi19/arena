# Despliegue y operación

Arena se despliega como un conjunto de contenedores Docker en un servidor (VPS) con
[`docker-compose.prod.yml`](../docker-compose.prod.yml). Las imágenes las construye y publica la integración continua.

```
Internet ──► Caddy :80/:443 (HTTPS automático)
               ├── WEB_DOMAIN ──► web   (Next.js standalone, :3000)
               └── API_DOMAIN ──► api   (NestJS, :4100 · REST, Swagger, webhooks, socket.io)
                                   │
                    migrate (una vez por despliegue) ──► db (Postgres 17, solo red interna)
                    backup  (pg_dump diario a ./backups)
                    storage (SeaweedFS, opcional) o S3 externo (AWS S3 / Cloudflare R2)
```

## Ambientes

| Ambiente | Cómo se levanta | Base de datos | Configuración |
|---|---|---|---|
| Desarrollo | `docker compose up -d db storage` + `npm run dev:api` / `npm run dev:web` | `arena` (puerto 5433) | `apps/api/.env`, `apps/web/.env.local` |
| Pruebas | `npm test` (local) o CI | `arena_test` (se crea con `infra/postgres/init`) | `apps/api/.env.test` |
| Producción | `./infra/scripts/deploy.sh` | volumen `db_data` del servidor | `infra/.env.production`, `apps/api/.env.production` |

## Integración continua (`.github/workflows/ci.yml`)

En cada push a `main` y en cada pull request:

1. **API:** instala dependencias, genera el cliente Prisma, comprueba tipos, levanta Postgres 17 y SeaweedFS, aplica
   migraciones y datos de prueba en `arena_test` y ejecuta las pruebas unitarias y de integración (Vitest + Supertest).
   Compila la API.
2. **Web:** ESLint (`eslint-config-next`), comprobación de tipos y `next build`.
3. **Imágenes:** construye `apps/api/Dockerfile` y `apps/web/Dockerfile`. En `main` las publica en GitHub Container
   Registry como `ghcr.io/<owner>/<repo>-api` y `-web`, con las etiquetas `latest` y el SHA del commit.

Configura en el repositorio (Settings → Secrets and variables → Actions → Variables) `PUBLIC_API_URL` con la URL
pública de la API (`https://api.tu-dominio.com`): queda incrustada en el JavaScript del navegador al construir la web.

Para verificar lo mismo en local antes de subir cambios: `npm run ci` (con `docker compose up -d db storage`).

## Primer despliegue

Requisitos del servidor: Linux con Docker Engine 24+ y el plugin Compose, puertos 80 y 443 abiertos, y dos registros
DNS (A/AAAA) apuntando a su IP: el de la web y el de la API.

```bash
git clone <repo> /opt/arena && cd /opt/arena
cp infra/.env.production.example infra/.env.production
cp apps/api/.env.production.example apps/api/.env.production
```

1. **`infra/.env.production`:** dominios, correo para Let's Encrypt, nombres de las imágenes de GHCR y la contraseña
   de Postgres (`openssl rand -base64 32 | tr -d '/+='`).
2. **`apps/api/.env.production`:**
   - `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET`: valores distintos de `openssl rand -base64 48`. La API no arranca en
     producción con secretos cortos o de ejemplo.
   - `CORS_ORIGINS` y `PUBLIC_WEB_URL`: `https://<WEB_DOMAIN>`. `PUBLIC_API_URL`: `https://<API_DOMAIN>`.
   - Almacenamiento: credenciales de un bucket S3 o R2 (`S3_ENDPOINT`, `S3_PUBLIC_URL`, claves y nombres de bucket).
     El bucket público necesita lectura anónima; el privado, no. Para usar SeaweedFS en el mismo servidor, copia
     `infra/seaweedfs/s3.production.example.json` a `s3.production.json` con claves propias y añade `--profile storage`.
   - Pagos: claves y secretos de webhook de Stripe y/o Mercado Pago, y `BILLING_SANDBOX=false`.
   - `SUPERADMIN_EMAIL`, `SUPERADMIN_USERNAME` y `SUPERADMIN_PASSWORD` (12+ caracteres) para crear el primer
     administrador.
3. Si las imágenes de GHCR son privadas: `docker login ghcr.io` con un token con permiso `read:packages`.
4. Despliega:

   ```bash
   ./infra/scripts/deploy.sh
   ```

   El servicio `migrate` aplica las migraciones y carga los datos base (planes FREE/PRO/BUSINESS, deportes,
   videojuegos, rangos, reglas de ranking, logros y el primer SUPERADMIN). Nunca crea los datos demo: el seed los
   rechaza con `NODE_ENV=production`.
5. Entra con el SUPERADMIN, cambia su contraseña en **Perfil → Seguridad** y borra `SUPERADMIN_PASSWORD` de
   `apps/api/.env.production`.
6. Webhooks de pago: registra `https://<API_DOMAIN>/api/billing/webhooks/stripe` en Stripe (eventos
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` y
   `checkout.session.expired`) y
   `https://<API_DOMAIN>/api/billing/webhooks/mercadopago` en Mercado Pago.

## Actualizaciones y vuelta atrás

- **Automática desde GitHub:** Actions → *Deploy* → *Run workflow* con la etiqueta (`latest` o el SHA de un commit).
  Requiere los secretos `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, la variable opcional `DEPLOY_PATH`
  (por defecto `/opt/arena`) y el environment `production` (permite exigir aprobación manual).
- **Manual en el servidor:** `git pull && ./infra/scripts/deploy.sh`.
- **Volver a una versión anterior:** `IMAGE_TAG=<sha anterior> ./infra/scripts/deploy.sh`. Las migraciones de Prisma
  solo avanzan: si la versión nueva cambió el esquema, restaura además la copia `backups/pre-deploy-*.sql.gz` que el
  script crea antes de cada despliegue.
- **Construir en el servidor** (sin registro): `BUILD=1 ./infra/scripts/deploy.sh`.

## Copias de seguridad

- El servicio `backup` guarda un `pg_dump` comprimido al día en `./backups` y conserva `BACKUP_KEEP_DAYS` días (14 por
  defecto). `deploy.sh` añade una copia `pre-deploy-*` antes de cada despliegue. Copia esa carpeta fuera del servidor
  (rclone, restic o el backup del proveedor).
- Restaurar:

  ```bash
  gunzip -c backups/arena-AAAAMMDD-HHMM.sql.gz | \
    docker compose --env-file infra/.env.production -f docker-compose.prod.yml exec -T db psql -U arena arena
  ```

- Los archivos (logos, documentos de verificación) viven en el almacenamiento S3: activa el versionado o la
  replicación del bucket en el proveedor.

## Operación

```bash
alias arena='docker compose --env-file infra/.env.production -f docker-compose.prod.yml'
arena ps                    # estado y salud de los servicios
arena logs -f api           # registros de la API (también: web, caddy, migrate, backup)
arena exec db psql -U arena arena
```

- Salud: `https://<API_DOMAIN>/api/health` (incluye la base de datos) y `https://<WEB_DOMAIN>/healthz`. Los
  contenedores `api` y `web` tienen healthcheck y Docker los reinicia si caen.
- Las tareas periódicas corren dentro de la API, sin cron externo: ciclo de vida de suscripciones (cada 10 minutos),
  avisos de transmisiones, mantenimiento de verificaciones (cada hora) y fotos diarias del ranking. El stack está pensado
  para **una sola réplica de la API**: con varias, esas tareas se ejecutarían en cada una (los pagos y el ranking ya
  usan candados de Postgres, el resto no).
- Caddy renueva los certificados solo y añade HSTS, `nosniff`, `Referrer-Policy` y `Permissions-Policy`; Next.js añade
  la CSP de marcos embebidos.
