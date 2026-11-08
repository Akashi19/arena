# Arena · Plataforma de torneos deportivos y eSports

Plataforma web para crear, administrar y participar en torneos de deportes tradicionales y videojuegos.
Cada organizador tiene su propio espacio con identidad visual (logo, color, banner) y panel de administración;
los participantes descubren competiciones, consultan la **verificación** y la **reputación** del organizador y
solicitan su inscripción.

> Las cuotas de inscripción son **importes informativos** fijados por cada organizador. La plataforma no procesa
> apuestas, cuotas de pronóstico ni retiros de dinero. Los pagos de suscripción SaaS están separados por completo.

## Estado del desarrollo

| Fase | Contenido | Estado |
|---|---|---|
| Base | Monorepo, Docker Compose, modelo de datos completo (todos los módulos 1-23), migraciones, seed | ✅ |
| 1 | Diseño UX/UI oscuro con acentos neón, responsive | ✅ |
| 2 | Registro, autenticación JWT + refresh, RBAC, perfiles, logo del organizador | ✅ |
| 3 | Partidas/torneos: CRUD, filtros, paginación, enlaces públicos, inscripciones, límites FREE/PRO/BUSINESS | ✅ |
| 4 | Equipos y jugadores | 🟡 equipos básicos (CRUD, escudo, integrantes, capitán, historial); faltan fichas de jugador sin cuenta y estadísticas |
| 5 | Resultados, fixtures, llaves y clasificaciones automáticas | ✅ eliminación simple y doble, liga, grupos y grupos + playoffs; resultados versionados, avance automático, tabla, horarios y campeón |
| 6 | Dashboard y estadísticas | 🟡 KPIs del organizador listos; faltan estadísticas avanzadas |
| 7 | Seguridad, pruebas y despliegue | 🟡 pruebas unitarias e integración, Dockerfiles; faltan CI y despliegue |
| 17 | SaaS: planes, límites y "Mi suscripción" | 🟡 planes, feature flags y límites en backend; faltan pagos (Stripe/Mercado Pago), webhooks y panel SUPERADMIN |
| 18-20 | Verificación, reputación y Trust & Reputation System | 🟡 insignia, indicadores y panel de confianza visibles; faltan solicitudes, valoraciones e incidencias |
| 21-23 | Perfiles gamer, rankings globales, transmisiones en vivo | ⏳ tablas creadas, sin API ni UI aún |

## Stack

- **Frontend:** Next.js 16 (App Router, Server Components, Server Actions, `proxy.ts`), React 19, TypeScript, Tailwind CSS 4.
- **Backend:** NestJS 12 (ESM), API REST con Swagger, WebSockets (socket.io), JWT + RBAC, validación con `class-validator`, rate limiting.
- **Base de datos:** PostgreSQL 17 con Prisma 7 (driver adapter `pg`).
- **Almacenamiento:** S3-compatible (SeaweedFS en local; AWS S3, Cloudflare R2 u otro proveedor S3 en producción). Bucket público para imágenes y bucket privado con URLs firmadas para documentos.

## Estructura

```
torneos/
├── apps/
│   ├── api/                      # NestJS
│   │   ├── prisma/
│   │   │   ├── schema.prisma     # modelo de datos completo (≈60 tablas)
│   │   │   ├── migrations/       # SQL de creación + restricciones e índices parciales
│   │   │   └── seed.ts           # planes, catálogo, rangos, logros, datos demo
│   │   ├── src/
│   │   │   ├── auth/             # registro, login, refresh, cambio de contraseña
│   │   │   ├── organizers/       # perfil de usuario, espacio del organizador, perfil público
│   │   │   ├── tournaments/      # partidas, filtros, inscripciones
│   │   │   ├── matches/          # motor de llaves (engine.ts), fixture, resultados, clasificación
│   │   │   ├── teams/            # equipos e integrantes
│   │   │   ├── catalog/          # deportes, videojuegos y rangos (admin)
│   │   │   ├── plans/            # feature flags y límites por suscripción
│   │   │   ├── dashboard/        # indicadores del organizador
│   │   │   ├── notifications/    # notificaciones in-app (+ preferencias)
│   │   │   ├── realtime/         # gateway socket.io
│   │   │   ├── storage/          # subida validada a S3
│   │   │   ├── audit/            # registro de auditoría
│   │   │   └── common/           # guards JWT/roles, filtros, utilidades
│   │   └── test/                 # pruebas de integración (supertest)
│   └── web/                      # Next.js
│       ├── app/                  # rutas públicas, (auth), dashboard, server actions
│       ├── components/           # tarjetas, insignia, formularios, tiempo real
│       ├── lib/                  # cliente API (server-only), sesión, tipos, formato
│       └── proxy.ts              # renovación transparente del JWT
├── docs/                         # arquitectura, modelo ER, API (OpenAPI)
├── infra/                        # init de Postgres (BD de pruebas), config S3 local
└── docker-compose.yml
```

## Puesta en marcha (desarrollo)

Requisitos: Node.js 22 o superior y Docker.

```bash
npm install
```

```bash
cp apps/api/.env.example apps/api/.env
```

```bash
cp apps/web/.env.example apps/web/.env.local
```

```bash
npm run infra:up
```

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm run dev:api
```

```bash
npm run dev:web
```

- Web: http://localhost:3100
- API: http://localhost:4100/api · Swagger: http://localhost:4100/api/docs
- Postgres: `localhost:5433` · S3 local: `localhost:8333`

> Los puertos 3100/4100/5433/8333 evitan choques con otros proyectos locales. Se cambian con las variables
> `WEB_PORT`, `API_PORT`, `POSTGRES_PORT`, `S3_PORT` de Docker Compose y `PORT` en `apps/api/.env`.

### Datos de prueba

El seed crea planes, 6 deportes, 8 videojuegos con sus rangos, logros, reglas de ranking v1 y datos demo.
Todas las cuentas demo usan la contraseña `Arena2026demo` (solo desarrollo):

| Usuario | Rol | Notas |
|---|---|---|
| `superadmin` | SUPERADMIN | `admin@arena.test` |
| `ligagamer` | ORGANIZADOR | Verificado, 2 torneos activos (en el límite FREE) |
| `clubandes` | ORGANIZADOR | Club de fútbol 7 y básquet |
| `nova`, `kraken`, `zeta`, `luna`, `blitz`, `shadow`, `pixel`, `titan` | JUGADOR | Con perfiles gamer; `kraken` y `shadow` tienen equipo |

## Ambientes

| Ambiente | Archivo | Base de datos |
|---|---|---|
| Desarrollo | `apps/api/.env` (desde `.env.example`) | `arena` |
| Pruebas | `apps/api/.env.test` | `arena_test` (se crea al iniciar el contenedor) |
| Producción | `apps/api/.env.production` (desde `.env.production.example`) | la de `DATABASE_URL` |

En producción la API se niega a arrancar si los secretos JWT son los de ejemplo o tienen menos de 32 caracteres.

## Pruebas

```bash
npm run test:db -w apps/api
```

```bash
npm test
```

Incluye pruebas unitarias de límites y feature flags (`src/plans/plans.spec.ts`), del motor de llaves y tablas
(`src/matches/engine.spec.ts`, simula llaves completas de 2 a 17 participantes) y de integración contra
`arena_test` (`test/api.e2e.spec.ts`): autenticación y revocación, límites del plan FREE, validación de fechas,
aislamiento entre organizadores, inscripciones, borradores privados, bloqueo de auto-asignación de la insignia y el
ciclo completo de fixture → resultados → correcciones → campeón en cada formato (`test/fixture.e2e.spec.ts`).

## Docker (stack completo)

```bash
cp apps/api/.env.production.example apps/api/.env.production
```

Edita los secretos de `apps/api/.env.production` y luego:

```bash
docker compose --profile app up -d --build
```

La API aplica las migraciones al arrancar. Para cargar los datos demo en ese stack, ejecuta `npm run db:seed`
desde tu máquina: el contenedor de Postgres publica el puerto 5433, el mismo que usa `apps/api/.env`.

## Documentación

- [Arquitectura y modelo entidad-relación](docs/ARQUITECTURA.md)
- [API REST](docs/API.md) · especificación OpenAPI en [docs/openapi.json](docs/openapi.json) y Swagger en `/api/docs`
