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
export const formatDay = (iso: string) => formatDate(iso, { timeZone: 'UTC' });

export const formatPoints = (n: number) => new Intl.NumberFormat('es').format(n);
