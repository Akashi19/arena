# API REST

- Base: `http://localhost:4100/api`
- Documentación interactiva: `http://localhost:4100/api/docs` (Swagger) · especificación: [`openapi.json`](openapi.json)
- Autenticación: `Authorization: Bearer <accessToken>`. Obtén el par de tokens con `POST /auth/login` y renueva con `POST /auth/refresh`.
- Paginación: `?page=1&pageSize=12` (máx. 100). Respuesta: `{ items, page, pageSize, total, totalPages }`.
- Errores: `{ statusCode, message }`. Los límites del plan devuelven `403` con `error: "PLAN_LIMIT"`, `code`, `limit`, `used` y `plan`.

```json
{
  "statusCode": 403,
  "error": "PLAN_LIMIT",
  "code": "ACTIVE_TOURNAMENTS_LIMIT",
  "message": "Has alcanzado el límite de 2 torneos activos de tu plan Free. Actualiza tu suscripción para crear más torneos.",
  "limit": 2,
  "used": 2,
  "plan": "FREE"
}
```

## Endpoints disponibles

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/health` | — | Estado de la API y la base de datos |
| POST | `/auth/register` | — | Registro (crea perfil, ficha de jugador y, opcionalmente, espacio de organizador en FREE) |
| POST | `/auth/login` | — | Login por correo o usuario |
| POST | `/auth/refresh` | — | Renueva tokens |
| POST | `/auth/logout-all` | ✔ | Revoca todos los refresh tokens |
| POST | `/auth/change-password` | ✔ | Cambia la contraseña y revoca sesiones |
| GET | `/auth/me` | ✔ | Usuario actual y notificaciones sin leer |
| PATCH | `/me/profile` | ✔ | Datos personales y privacidad del perfil público |
| POST | `/me/avatar` | ✔ | Avatar (multipart `file`) |
| POST | `/me/become-organizer` | ✔ | Activa el espacio de organizador |
| GET/PATCH | `/me/organizer` | Organizador | Identidad del organizador (color de marca: plan PRO o superior) |
| POST | `/me/organizer/logo` · `/me/organizer/banner` | Organizador | Logo · banner (PRO o superior) |
| GET | `/organizers` | — | Listado (`q`, `country`, `verified`, `featured`) |
| GET | `/organizers/{username}` | — | Perfil público: estadísticas, próximas competiciones e historial |
| GET | `/sports` · `/games` · `/games/{id}/ranks` | — | Catálogo |
| GET/POST/PATCH | `/admin/sports`, `/admin/games`, `/admin/games/{id}/ranks`, `/admin/ranks/{id}` | SUPERADMIN | Administración del catálogo sin tocar código |
| GET | `/home` | — | Datos de la portada |
| GET | `/tournaments` | — | Búsqueda: `q, category, sport, game, country, city, from, to, mode, format, status, feeMin, feeMax, online, organizer, featured, verifiedOnly, sort` |
| GET | `/tournaments/{slug o id}` | opcional | Detalle (enlace público compartible); los borradores solo los ve el organizador |
| POST | `/tournaments` | Organizador | Crea partida (valida límites del plan) |
| PATCH | `/tournaments/{id}` | Propietario | Edita; un cambio de horario notifica a los inscritos |
| PATCH | `/tournaments/{id}/status` | Propietario | `OPEN`, `IN_PROGRESS`, `FINISHED` |
| POST | `/tournaments/{id}/cancel` | Propietario | Cancela con motivo |
| POST | `/tournaments/{id}/cover` | Propietario | Portada |
| GET | `/me/tournaments` | Organizador | Mis partidas con inscripciones pendientes |
| POST | `/tournaments/{id}/registrations` | ✔ | Solicita inscripción (`teamId` en partidas por equipos, `acceptRules: true`) |
| GET | `/tournaments/{id}/registrations` | Propietario | Gestión de inscripciones |
| PATCH | `/registrations/{id}` | Propietario | Aprueba o rechaza |
| DELETE | `/registrations/{id}` | Solicitante | Retira la inscripción |
| GET | `/me/registrations` | ✔ | Mis inscripciones |
| GET | `/tournaments/{id}/fixture` | — | Encuentros con su último resultado válido, tabla de posiciones y progreso |
| POST | `/tournaments/{id}/fixture` | Propietario | Genera (o regenera, si no hay resultados) el fixture según el formato: `shuffle`, `roundIntervalMinutes` |
| POST | `/tournaments/{id}/playoffs` | Propietario | Grupos + playoffs: genera la llave final con los mejores de cada grupo |
| POST | `/matches/{id}/result` | Propietario | Registra o corrige (`reason` obligatorio) el marcador: `score1`, `score2`, `winnerSlot` para desempates |
| PATCH | `/matches/{id}` | Propietario | Horario (con historial y aviso), sede y estado `LIVE` |
| GET | `/me/teams` · `/teams/{slug}` | ✔ · — | Mis equipos · ficha pública |
| POST/PATCH/DELETE | `/teams`, `/teams/{id}` | Dueño | CRUD de equipos |
| POST | `/teams/{id}/logo` | Dueño | Escudo |
| POST/DELETE | `/teams/{id}/members[/{playerId}]` | Dueño | Agregar o retirar integrantes (se conserva el historial) |
| POST | `/teams/{id}/guests` | Dueño | Agrega un jugador sin cuenta (`fullName`, `nickname`, `role`, `jerseyNumber`) |
| GET | `/players` | — | Búsqueda: `q` (apodo, usuario o gamertag), `game`, `level`, `platform`, `country`, `recruitment` |
| GET | `/players/{username}` | opcional | Ficha pública: perfiles gamer, estadísticas oficiales, logros, equipos e historial (según su privacidad) |
| GET/PATCH | `/me/player` | ✔ | Mi ficha: estado de búsqueda de equipo, posición, dorsal, disponibilidad |
| POST · PATCH · DELETE | `/me/games` · `/me/games/{id}` | ✔ | Perfiles gamer: plataforma, gamertag, nivel, rango, rol; los cambios de nivel quedan en el historial |
| PATCH | `/teams/{id}/captain` | Dueño | Capitán |
| GET | `/me/dashboard` | Organizador | Indicadores del panel |
| GET | `/plans` · `/me/subscription` | — · Organizador | Planes · plan actual, uso y funcionalidades |
| GET | `/me/notifications` · PATCH `/{id}/read` · POST `/read-all` | ✔ | Notificaciones |

## Tiempo real

Conexión socket.io a `http://localhost:4100/realtime`, con `auth: { token }` para recibir notificaciones personales.

| Evento (cliente → servidor) | Payload |
|---|---|
| `tournament:join` / `tournament:leave` | `tournamentId` |

| Evento (servidor → cliente) | Sala |
|---|---|
| `notification` | `user:{id}` |
| `registration:changed`, `tournament:updated`, `tournament:status`, `fixture:updated`, `match:updated` | `tournament:{id}` |

## Endpoints planificados en próximas fases

Definidos en la especificación y respaldados por las tablas ya creadas: valoraciones e incidencias (`/organizers/{id}/ratings`,
`/organizers/{id}/reputation`, `/tournaments/{id}/incidents`, `/admin/reputation`), verificación, rankings (`/rankings/*`, `/admin/ranking/*`),
transmisiones (`/matches/{id}/stream`, `/streams/live`), comparador de jugadores (`/players/compare`) y pagos de suscripción
con webhooks.
