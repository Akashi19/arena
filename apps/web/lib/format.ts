import type { CompetitiveLevel, ReputationLevel, TournamentFormat, TournamentStatus, VerificationStatus } from './types';

export const STATUS_LABEL: Record<TournamentStatus, string> = {
  DRAFT: 'Borrador',
  OPEN: 'Abierta',
  IN_PROGRESS: 'En curso',
  FINISHED: 'Finalizada',
  CANCELLED: 'Cancelada',
};

export const FORMAT_LABEL: Record<TournamentFormat, string> = {
  SINGLE_ELIMINATION: 'Eliminación directa',
  DOUBLE_ELIMINATION: 'Doble eliminación',
  ROUND_ROBIN: 'Liga (todos contra todos)',
  GROUPS: 'Fase de grupos',
  GROUPS_PLAYOFFS: 'Grupos y playoffs',
};

export const MODE_LABEL = { INDIVIDUAL: 'Individual', TEAM: 'Por equipos' } as const;

export const LEVEL_LABEL: Record<CompetitiveLevel, string> = {
  BEGINNER: 'Principiante',
  INTERMEDIATE: 'Intermedio',
  ADVANCED: 'Avanzado',
  EXPERT: 'Experto',
  PROFESSIONAL: 'Profesional',
};

export const REPUTATION_LABEL: Record<ReputationLevel, string> = {
  NEW: 'Nuevo organizador',
  INITIAL: 'Reputación inicial',
  GOOD: 'Buen organizador',
  EXCELLENT: 'Excelente organizador',
  TOP: 'Organizador destacado',
};

export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  NOT_REQUESTED: 'No solicitada',
  PENDING: 'Pendiente',
  UNDER_REVIEW: 'En revisión',
  VERIFIED: 'Verificado',
  REJECTED: 'Rechazada',
  SUSPENDED: 'Suspendida',
  EXPIRED: 'Vencida',
};

export const ORGANIZER_TYPE_LABEL: Record<string, string> = {
  PERSON: 'Persona',
  TEAM: 'Equipo',
  CLUB: 'Club',
  ACADEMY: 'Academia',
  COMPANY: 'Empresa',
};

export const PLATFORM_LABEL: Record<string, string> = {
  PC: 'PC',
  PLAYSTATION: 'PlayStation',
  XBOX: 'Xbox',
  NINTENDO: 'Nintendo',
  MOBILE: 'Móvil',
  CROSSPLAY: 'Crossplay',
  NONE: '—',
};

export const COUNTRIES: Record<string, string> = {
  AR: 'Argentina',
  BO: 'Bolivia',
  BR: 'Brasil',
  CL: 'Chile',
  CO: 'Colombia',
  CR: 'Costa Rica',
  EC: 'Ecuador',
  ES: 'España',
  GT: 'Guatemala',
  MX: 'México',
  PA: 'Panamá',
  PE: 'Perú',
  PY: 'Paraguay',
  DO: 'República Dominicana',
  US: 'Estados Unidos',
  UY: 'Uruguay',
  VE: 'Venezuela',
};

export const CURRENCIES = ['USD', 'PEN', 'CLP', 'MXN', 'COP', 'ARS', 'BOB', 'UYU', 'EUR', 'BRL'];

export function flag(code?: string | null) {
  if (!code || code.length !== 2) return '';
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

const TZ = 'America/Lima';

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeZone: TZ, ...opts }).format(new Date(iso));
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: TZ }).format(new Date(iso));
}

export function formatMoney(amount: string | number, currency: string) {
  const n = Number(amount);
  if (n === 0) return 'Gratis';
  try {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

/** Valor para <input type="datetime-local"> en la zona horaria del navegador. */
export function toLocalInput(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

export const RECRUITMENT_LABEL: Record<string, string> = {
  NOT_LOOKING: 'No busca equipo',
  LOOKING_FOR_TEAM: 'Busca equipo',
  LOOKING_FOR_PLAYERS: 'Busca jugadores',
};

/** Origen del nivel competitivo: el declarado por el jugador se distingue del verificado. */
export const LEVEL_SOURCE_LABEL: Record<string, string> = {
  SELF_DECLARED: 'Declarado por el jugador',
  PLATFORM_VERIFIED: 'Verificado por la plataforma',
  EXTERNAL_VERIFIED: 'Verificado externamente',
};

export const INVITATION_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente',
  ACCEPTED: 'Aceptada',
  DECLINED: 'Rechazada',
  CANCELLED: 'Cancelada',
  EXPIRED: 'Caducada',
};

export const INCIDENT_TYPE_LABEL: Record<string, string> = {
  SCHEDULE_BREACH: 'Incumplimiento de horarios',
  UNANNOUNCED_CHANGES: 'Cambios no comunicados',
  ORGANIZATION_ISSUES: 'Problemas de organización',
  RULES_BREACH: 'Incumplimiento del reglamento',
  REGISTRATION_ISSUES: 'Problemas de inscripción',
  UNJUSTIFIED_CANCELLATION: 'Cancelación injustificada',
  OTHER: 'Otros',
};

export const INCIDENT_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Abierta',
  UNDER_REVIEW: 'En revisión',
  RESOLVED: 'Confirmada',
  DISMISSED: 'Desestimada',
};

export const MODERATION_LABEL: Record<string, string> = {
  PENDING: 'Pendiente de moderación',
  APPROVED: 'Publicada',
  HIDDEN: 'Oculta',
  SUSPENDED: 'Suspendida',
};

export const RATING_CRITERIA = [
  { key: 'organizationScore', avg: 'organizationAverage', label: 'Organización', weight: '25 %' },
  { key: 'punctualityScore', avg: 'punctualityAverage', label: 'Cumplimiento de horarios', weight: '25 %' },
  { key: 'communicationScore', avg: 'communicationAverage', label: 'Comunicación', weight: '20 %' },
  { key: 'transparencyScore', avg: 'transparencyAverage', label: 'Transparencia', weight: '15 %' },
  { key: 'overallExperienceScore', avg: 'experienceAverage', label: 'Experiencia general', weight: '15 %' },
] as const;

export const SEASON_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  SCHEDULED: 'Programada',
  ACTIVE: 'Activa',
  COMPLETED: 'Finalizada',
  ARCHIVED: 'Archivada',
};

export const RULE_STATUS_LABEL: Record<string, string> = { DRAFT: 'Borrador', ACTIVE: 'Activa', RETIRED: 'Retirada' };

export const RANKING_EVENT_LABEL: Record<string, string> = {
  MATCH_WIN: 'Victoria',
  MATCH_DRAW: 'Empate',
  MATCH_LOSS: 'Derrota',
  MATCH_PARTICIPATION: 'Participación',
  TOURNAMENT_PLACEMENT: 'Puesto final',
  ADJUSTMENT: 'Ajuste administrativo',
};

export const REPORT_STATUS_LABEL: Record<string, string> = { OPEN: 'En revisión', UPHELD: 'Procede', DISMISSED: 'Desestimado' };

/** Fechas de calendario (inicio/fin de temporada, vigencia de reglas, semanas): se guardan a las 00:00 UTC. */
export const MATCH_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Por definir',
  SCHEDULED: 'Programado',
  LIVE: 'En curso',
  COMPLETED: 'Finalizado',
  CANCELLED: 'Cancelado',
};

export const BRACKET_LABEL: Record<string, string> = {
  WINNERS: 'Llave',
  LOSERS: 'Llave de perdedores',
  GRAND_FINAL: 'Gran final',
  GROUP: 'Grupo',
  LEAGUE: 'Liga',
  PLAYOFF: 'Playoffs',
};

export const STREAM_STATUS_LABEL: Record<string, string> = {
  NOT_CONFIGURED: 'Sin transmisión',
  SCHEDULED: 'Próximamente',
  LIVE: 'En vivo',
  ENDED: 'Finalizada',
  CANCELLED: 'Cancelada',
};

export const STREAM_NOTIFICATION_LABEL: Record<string, { title: string; hint: string }> = {
  STREAM_UPCOMING: { title: 'Transmisión próxima', hint: '30 minutos antes del inicio programado' },
  STREAM_LIVE: { title: 'Encuentro en vivo', hint: 'Cuando el organizador activa EN VIVO' },
  STREAM_UPDATED: { title: 'Cambio de enlace', hint: 'Si la transmisión pasa a otro canal' },
  STREAM_CANCELLED: { title: 'Transmisión cancelada', hint: 'Si se cancela o se retira el enlace' },
};

export const formatDay = (iso: string) => formatDate(iso, { timeZone: 'UTC' });

export const formatPoints = (n: number) => new Intl.NumberFormat('es').format(n);

export const SUBSCRIPTION_STATUS_LABEL: Record<string, string> = {
  TRIAL: 'Prueba',
  ACTIVE: 'Activa',
  PAST_DUE: 'Pago pendiente',
  CANCELLED: 'Cancelada',
  EXPIRED: 'Vencida',
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente',
  SUCCEEDED: 'Pagado',
  FAILED: 'Rechazado',
  REFUNDED: 'Reembolsado',
  CANCELLED: 'Anulado',
};

export const PAYMENT_KIND_LABEL: Record<string, string> = { NEW: 'Alta', UPGRADE: 'Cambio de plan', RENEWAL: 'Renovación' };

export const PERIOD_LABEL: Record<string, string> = { MONTHLY: 'Mensual', YEARLY: 'Anual' };

export const PROVIDER_LABEL: Record<string, string> = { STRIPE: 'Stripe', MERCADOPAGO: 'Mercado Pago', SANDBOX: 'Pago de prueba', MANUAL: 'Sin cobro' };

/** Importe exacto (a diferencia de formatMoney, 0 no se muestra como «Gratis»). */
export function formatAmount(amount: string | number, currency: string) {
  const n = Number(amount);
  try {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency, minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

const PERCENT = new Intl.NumberFormat('es-PE', { style: 'percent', maximumFractionDigits: 0 });
const PERCENT_1 = new Intl.NumberFormat('es-PE', { style: 'percent', maximumFractionDigits: 1 });

/** Proporción 0..1 como porcentaje; «—» cuando no hay base para calcularla. */
export function formatPercent(v: number | null | undefined, precise = false) {
  if (v === null || v === undefined) return '—';
  return (precise ? PERCENT_1 : PERCENT).format(v);
}

/** Variación frente al periodo anterior («+25 %», «−10 %», «sin cambios»); null si no es comparable. */
export function formatChange(v: number | null | undefined) {
  if (v === null || v === undefined) return null;
  if (Math.abs(v) < 0.005) return 'sin cambios';
  return `${v > 0 ? '+' : '−'}${PERCENT.format(Math.abs(v))}`;
}

export const STATS_PERIOD_LABEL: Record<number, string> = { 1: 'Este mes', 3: 'Últimos 3 meses', 6: 'Últimos 6 meses', 12: 'Últimos 12 meses' };
export const CATEGORY_LABEL: Record<string, string> = { SPORT: 'Deportes', ESPORT: 'eSports' };
