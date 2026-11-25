# Despliegue en Dokploy

Arena se despliega en Dokploy como un servicio **Docker Compose** con
[`docker-compose.dokploy.yml`](../docker-compose.dokploy.yml): Postgres, SeaweedFS (archivos), un paso de migraciones y
datos base, la API, la web y copias diarias de la base. Traefik de Dokploy hace de proxy; los dominios se asignan desde su
panel.

```
Traefik (Dokploy) ──► web     :3000   dominio de la web
                  ├─► api     :4100   dominio de la API (REST, Swagger, webhooks, socket.io)
                  └─► storage :8333   dominio de archivos (logos, portadas; solo el bucket público es legible)
migrate (una vez por despliegue) ──► db (Postgres 17)     backup (pg_dump diario)
```

## 1. Código en GitHub

Dokploy construye desde el repositorio. Crea un repositorio **privado** en GitHub y sube la rama `main`:

```bash
git remote add origin https://github.com/<usuario>/arena.git
git push -u origin main
```

En Dokploy: **Settings → Git → GitHub → Create GitHub App** y concédele acceso a ese repositorio.

## 2. Servicio en Dokploy

1. **Projects → Create Project** (por ejemplo «Arena») → **Create Service → Compose**.
2. Pestaña **General**: proveedor **GitHub**, el repositorio, rama `main`, *Compose Path* `./docker-compose.dokploy.yml`.
   Guarda (**Save**).
3. Pestaña **Domains**, un dominio por servicio (botón **Generate** para un dominio `traefik.me` de prueba, o uno propio
   con HTTPS):

   | Servicio | Puerto | Uso |
   |---|---|---|
   | `web` | 3000 | sitio |
   | `api` | 4100 | API y webhooks |
   | `storage` | 8333 | archivos públicos |

4. Pestaña **Environment**: genera las variables con esas tres URL y pégalas tal cual:

   ```bash
   ./infra/scripts/dokploy-env.sh http://<web>.traefik.me http://<api>.traefik.me http://<archivos>.traefik.me > infra/dokploy.env
   ```

   El script crea contraseñas y secretos aleatorios (Postgres, JWT, S3, clave de cifrado de pagos y el primer
   SUPERADMIN). `infra/dokploy.env` está en `.gitignore`: guárdalo en un gestor de contraseñas. Con URL `https://`
   pone `COOKIE_SECURE=true`; con `http://` (traefik.me) lo deja en `false`, porque si no el navegador descarta la sesión.
5. **Deploy**. La primera vez tarda varios minutos (construye las dos imágenes). En **Logs** debe verse en `migrate`
   «SUPERADMIN creado: admin» y en `api` «API escuchando».
6. Entra a la web con `admin` y la contraseña `SUPERADMIN_PASSWORD`, cámbiala en **Perfil → Seguridad** y borra
   `SUPERADMIN_PASSWORD` de las variables.
7. Opcional: **Auto Deploy** (pestaña General) para desplegar con cada push a `main`.

## Notas

- **La URL de la API queda dentro del JavaScript de la web** al construirla: si cambias el dominio de la API, cambia
  `PUBLIC_API_URL` y vuelve a desplegar.
- **Dominios traefik.me:** sirven para probar (HTTP, sin certificado). Para producción usa un dominio propio con HTTPS,
  `COOKIE_SECURE=true` y `BILLING_SANDBOX=false`. Mercado Pago real exige URL HTTPS para redirecciones y webhooks.
- **Datos:** los volúmenes `db_data`, `storage_data` y `backups_data` sobreviven a los despliegues. Copia las copias de
  seguridad fuera del servidor (Dokploy también ofrece *Backups* de volúmenes hacia S3).
- **Pagos y cobro de inscripciones:** completa las variables de Stripe y Mercado Pago y registra los webhooks como se
  explica en [DESPLIEGUE.md](DESPLIEGUE.md); las URL son las de los dominios de la API y la web.
- **Una sola réplica de la API:** las tareas periódicas corren dentro de ella (ver DESPLIEGUE.md).
