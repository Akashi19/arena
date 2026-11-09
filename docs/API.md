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
| POST · GET | `/teams/{id}/invitations` | Dueño | Invita a un jugador con cuenta (`username`, `message`) · lista las invitaciones del equipo |
| DELETE | `/invitations/{id}` | Dueño | Cancela una invitación pendiente |
| GET | `/me/invitations` | ✔ | Invitaciones pendientes recibidas (caducan a los 14 días) |
| POST | `/invitations/{id}/accept` · `/invitations/{id}/decline` | Invitado | Unirse al equipo o rechazar |
| GET | `/players` · `/players/search` | — | Búsqueda: `q`, `game`, `level`, `rank` (mínimo, requiere `game`), `platform`, `role`, `availability`, `team` (`with`/`without`), `verification`, `country`, `recruitment` |
| GET | `/players/compare` | opcional | Compara 2-4 jugadores (`players=a,b`) dentro de un videojuego (`game`); marca el mejor valor por métrica y respeta la privacidad |
| GET | `/players/level-criteria` | — | Umbrales con los que la plataforma respalda un nivel (PLATFORM_VERIFIED) |
| GET | `/players/{username}` | opcional | Ficha pública: perfiles gamer, estadísticas oficiales, logros, equipos e historial (según su privacidad) |
| GET | `/players/{username}/game-history` | opcional | Historial de niveles y rangos con su origen (`game` opcional); 403 si el jugador lo mantiene privado |
| GET/PATCH | `/me/player` | ✔ | Mi ficha: estado de búsqueda de equipo, posición, dorsal, disponibilidad |
| POST · PATCH · DELETE | `/me/games` · `/me/games/{id}` | ✔ | Perfiles gamer: plataforma, gamertag, nivel, rango, rol, principal, destacado, favorito; los cambios de nivel quedan en el historial |
| PUT | `/me/games/order` | ✔ | Orden de los juegos en el perfil público (`ids`) |
| PUT | `/tournaments/{id}/mvp` | Propietario | Jugador destacado de una partida finalizada (`playerId` o `null`); genera o retira el logro MVP |
| GET | `/admin/game-profiles` | SUPERADMIN | Perfiles gamer con sus estadísticas oficiales (`q`, `game`, `type`) |
| PUT | `/admin/game-profiles/{id}/verification` | SUPERADMIN | `EXTERNAL` (fuente autorizada, nivel y rango validados) o `REVOKE`; exige `reason` |
| PATCH | `/teams/{id}/captain` | Dueño | Capitán |
| GET | `/me/dashboard` | Organizador | Indicadores del panel |
| GET | `/me/dashboard/stats?months=1\|3\|6\|12` | Organizador · `ADVANCED_STATS` | Estadísticas avanzadas del periodo y del anterior (`summary`, `previous`, `changes`), series mensuales, disciplinas, formatos, más victorias y rendimiento por partida |
| GET | `/me/dashboard/report?months=` | Organizador · `EXECUTIVE_REPORTS` | Reporte ejecutivo: lo anterior más organizador, plan y reputación |
| GET | `/me/dashboard/export/{tournaments\|registrations\|matches}?months=` | Organizador · `EXPORT_REPORTS` | CSV (UTF-8 con BOM, fechas en UTC, protegido contra inyección de fórmulas; máx. 10 000 filas) |
| GET | `/admin/stats?months=` | SUPERADMIN | Estadísticas globales: usuarios por rol, registros, activos en 30 días, verificación, partidas por estado y categoría, organizadores más activos y los indicadores del periodo |
| GET · POST | `/me/verification` | Organizador | Estado e historial · solicitud (multipart: datos, `documents[]` hasta 5, `acceptPolicy`) |
| POST | `/me/verification/info` | Organizador | Responde a una solicitud de información adicional (`message`, `documents[]`) |
| GET | `/organizers/{id}/reputation` | — | Reputación, distribución de estrellas, evolución mensual e incidencias confirmadas |
| GET · POST | `/organizers/{id}/ratings` | — · Participante | Valoraciones públicas (`stars`) · valorar (5 criterios 1-5, `comment`, `tournamentId`) |
| PUT | `/ratings/{id}` | Autor | Edita durante 7 días (queda en `rating_history`) |
| POST · PUT | `/ratings/{id}/responses` | Organizador | Respuesta pública (una por valoración, editable 7 días) |
| POST | `/ratings/{id}/reports` | ✔ | Reporta una valoración |
| GET | `/tournaments/{id}/feedback` | ✔ | Si el usuario puede valorar, su valoración y sus incidencias |
| POST | `/tournaments/{id}/incidents` | Participante | Reporta una incidencia (multipart: `incidentType`, `description`, `evidence`) |
| GET | `/organizers/{id}/incidents` | — | Incidencias confirmadas (el organizador ve todas las suyas) |
| GET | `/me/reputation` | Organizador | Dashboard de reputación y respuestas pendientes |
| GET | `/admin/verifications[/{id}]` | SUPERADMIN | Solicitudes (`status`, `q`) y detalle (consulta auditada) |
| GET | `/admin/verifications/{id}/documents/{docId}` | SUPERADMIN | URL firmada de 5 min (auditada) |
| POST | `/admin/verifications/{id}/actions` | SUPERADMIN | `START_REVIEW`, `REQUEST_INFO`, `APPROVE`, `REJECT`, `SUSPEND`, `REINSTATE`, `RENEW` |
| POST | `/admin/verifications/maintenance` | SUPERADMIN | Vencimientos, avisos y política de conservación (también corre cada hora) |
| GET | `/admin/trust` · `/admin/reputation` · `/admin/ratings` · `/admin/incidents` · `/admin/cancellations` | SUPERADMIN | Dashboard de confianza y listados |
| PATCH | `/admin/ratings/{id}/moderation` | SUPERADMIN | Publicar, ocultar o suspender (justificación obligatoria) |
| PUT | `/admin/incidents/{id}/resolve` | SUPERADMIN | `UNDER_REVIEW`, `RESOLVED` (confirmada) o `DISMISSED` con resolución |
| PATCH | `/admin/tournaments/{id}/cancellation` | SUPERADMIN | Marca una cancelación como justificada o no |
| GET | `/plans` | — | Planes activos con sus funcionalidades |
| GET | `/me/subscription` | ORGANIZER | Plan efectivo, suscripción, uso, cambios programados, pago pendiente, prueba disponible y medios de pago habilitados |
| POST | `/me/subscription/quote` | ORGANIZER | Cotiza un cambio (`planCode`, `billingPeriod`, `promoCode`): `IMMEDIATE` (con descuento y saldo no usado), `SCHEDULED`, `TO_FREE` o `CURRENT` |
| POST | `/me/subscription/checkout` | ORGANIZER | Inicia el pago (`provider`; `idempotencyKey` obligatoria: repetirla devuelve el mismo pago) o programa el cambio. Responde `CHECKOUT` + `checkoutUrl`, `PAID` (importe cero) o `SCHEDULED` |
| POST | `/me/subscription/trial` · `/cancel` · `/resume` | ORGANIZER | Prueba gratuita (una por organizador, desde Free) · cancelar (al final del periodo; de inmediato en prueba o con pago vencido) · revertir cancelación o cambio programado |
| GET | `/me/subscription/payments` · `/payments/{id}` · `/history` · `/invoices/{id}` | ORGANIZER | Historial de pagos, detalle, historial de la suscripción y comprobante |
| POST | `/me/subscription/payments/{id}/sandbox` | ORGANIZER | Aprueba o rechaza un pago de prueba (solo con `BILLING_SANDBOX`, activo fuera de producción) |
| POST | `/billing/webhooks/stripe` · `/billing/webhooks/mercadopago` | Firma del proveedor | Confirmación de pagos. Stripe: `Stripe-Signature` sobre el cuerpo crudo; Mercado Pago: `x-signature` y consulta del pago a su API. Cada evento se procesa una sola vez y se verifican importe y moneda |
| GET | `/admin/billing/metrics` | SUPERADMIN | MRR, ARR, ARPU, ingresos del mes y del año, serie de 12 meses, churn de 30 días, conversión FREE→PRO y PRO→BUSINESS, organizadores por plan |
| GET · POST · PATCH | `/admin/billing/plans` | SUPERADMIN | Crear planes (códigos nuevos), precios, moneda, límites, prueba, gracia, funcionalidades y activar/desactivar (Free no se puede desactivar ni cobrar) |
| GET · POST · PATCH | `/admin/billing/promotions` | SUPERADMIN | Códigos promocionales (% o monto, planes, vigencia, usos máximos) |
| GET | `/admin/billing/subscriptions` · `/admin/billing/payments` | SUPERADMIN | Suscriptores (estado, plan, búsqueda, cancelaciones programadas) y pagos por estado |
| POST | `/admin/billing/lifecycle/run` | SUPERADMIN | Ejecuta ya la revisión de vencimientos (corre sola cada 10 minutos) |
| GET | `/me/notifications` · PATCH `/{id}/read` · POST `/read-all` | ✔ | Notificaciones |
| GET · PUT | `/me/notification-preferences` | ✔ | Avisos de transmisiones por canal (`inApp`, `email`, `whatsapp`; WhatsApp exige teléfono en el perfil) |
| GET | `/matches/{matchId}/stream` | — | Encuentro con su transmisión principal y retransmisiones activas (`streamStatus` = `NOT_CONFIGURED` si no tiene). Las privadas solo entregan el enlace al organizador y a los participantes del encuentro |
| POST · PUT · DELETE | `/matches/{matchId}/stream` | ORGANIZER | Agregar (`url`, `platform` opcional y verificada, `title`, `description`, `visibility`, `scheduledStartAt`, `scheduledEndAt`, `isRebroadcast`), editar (`streamId` opcional) o quitar el enlace (`?streamId&reason`; deja de estar activo y conserva el historial) |
| PATCH | `/matches/{matchId}/stream/status` | ORGANIZER | `SCHEDULED → LIVE → ENDED`, `CANCELLED`, reanudar (`ENDED → LIVE`) o reprogramar (`CANCELLED → SCHEDULED`) |
| GET | `/matches/{matchId}/stream/history` | ORGANIZER | Historial: enlace y estado anterior y nuevo, quién y por qué |
| GET | `/streams/live` · `/streams/upcoming` | — | Transmisiones públicas en vivo / programadas (`game`, paginación) |
| GET | `/tournaments/{tournamentId}/streams` | — | «Partidas transmitidas» del torneo (`status` = `LIVE`/`UPCOMING`/`ENDED`) con contadores por filtro |
| GET | `/rankings` | — | Clasificación de un videojuego: `game`, `type` (`PLAYER`/`TEAM`), `country`, `season` (sin ella, histórico acumulado), `platform`, paginación. Incluye evolución (↑ ↓ = NEW), provisionales y fecha de actualización |
| GET | `/rankings/global` · `/rankings/games/{gameId}` · `/rankings/countries/{countryCode}` · `/rankings/seasons/{seasonId}` | — | La misma tabla con el alcance fijado por la ruta |
| GET | `/rankings/seasons` · `/rankings/rules` | — | Temporadas publicadas (con campeones) · reglas de puntuación vigentes (`game`) |
| GET | `/rankings/players/{playerId}` · `/rankings/teams/{teamId}` | — | Perfil competitivo: posición global, nacional y de temporada por juego, historial de temporadas y últimos eventos (equipos: integrantes actuales e históricos y cambios de identidad) |
| GET | `/rankings/history/{participantId}` | — | Snapshots, resumen semanal y posición por temporada (`type`, `game`, `season`) |
| GET | `/rankings/compare` | — | Compara 2-4 participantes (`ids=a,b`) de un juego; marca el mejor valor por métrica |
| POST · GET | `/rankings/reports` · `/rankings/reports/mine` | ✔ | Reporta un resultado incorrecto (solo participantes del encuentro, 30 días tras el cierre) · mis reportes |
| GET · POST · PUT | `/admin/ranking/seasons` · `/{id}` | SUPERADMIN | Temporadas: alta, fechas, mínimo de encuentros y estados `DRAFT → SCHEDULED → ACTIVE → COMPLETED → ARCHIVED` (al cerrar se fijan los campeones) |
| GET · POST · PUT | `/admin/ranking/rules` · `/{id}` | SUPERADMIN | Reglas versionadas por juego y modalidad; activar o retirar una versión recalcula el juego |
| POST | `/admin/ranking/recalculate` | SUPERADMIN | Reprocesa los torneos finalizados (`gameId` opcional, `reason`); idempotente |
| GET | `/admin/ranking/audit` · `/admin/ranking/events` | SUPERADMIN | Historial de modificaciones · eventos de puntuación (quién confirmó cada resultado) |
| POST | `/admin/ranking/events/{id}/revert` · `/admin/ranking/adjustments` | SUPERADMIN | Revertir un evento · ajuste de puntos (± con justificación); nunca se borra historial |
| PUT | `/admin/ranking/suspensions` | SUPERADMIN | Suspensión temporal del ranking (`until` o `null` para levantarla) |
| GET · PUT | `/admin/ranking/tournaments` · `/{id}` | SUPERADMIN | Nivel (1-5) de cada partida y si puntúa |
| GET · PUT | `/admin/ranking/reports` · `/{id}` | SUPERADMIN | Revisión de resultados reportados: `UPHELD` revierte los puntos del encuentro, `DISMISSED` lo archiva |
| GET | `/admin/ranking/anomalies` | SUPERADMIN | Señales de manipulación: enfrentamientos repetidos con el mismo ganador y puntos concentrados en un organizador |

## Tiempo real

Conexión socket.io a `http://localhost:4100/realtime`, con `auth: { token }` para recibir notificaciones personales.

| Evento (cliente → servidor) | Payload |
|---|---|
| `tournament:join` / `tournament:leave` | `tournamentId` |

| Evento (servidor → cliente) | Sala |
|---|---|
| `notification` | `user:{id}` |
| `registration:changed`, `tournament:updated`, `tournament:status`, `fixture:updated`, `match:updated`, `stream:updated` | `tournament:{id}` |
| `streams:changed` `{ matchId }` | difusión general (alta, cambio de estado o de enlace de una transmisión) |
| `ranking:updated` `{ gameId }` | difusión general (al recalcularse el ranking de un juego) |

## Pendiente fuera de la especificación

Envío real de avisos por email y WhatsApp (las preferencias ya se guardan).
