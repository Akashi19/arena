import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';

/**
 * Fase 6: estadísticas avanzadas del organizador (PRO), reporte ejecutivo (BUSINESS), exportación CSV y
 * estadísticas globales de la plataforma (SUPERADMIN). Todo se agrega en Postgres; nada se calcula en el cliente.
 */

export const STATS_MONTHS = [1, 3, 6, 12] as const;
export type StatsMonths = (typeof STATS_MONTHS)[number];
export const EXPORT_KINDS = ['tournaments', 'registrations', 'matches'] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

// ---------------------------------------------------------------------------------------------
// Funciones puras (con pruebas unitarias)
// ---------------------------------------------------------------------------------------------

const monthStart = (d: Date, back: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1));

/**
 * Periodo de N meses calendario que termina ahora (el mes en curso cuenta como uno) y el periodo anterior de
 * igual duración, para comparar.
 */
export function statsRange(months: number, now = new Date()) {
  const from = monthStart(now, months - 1);
  const previousFrom = monthStart(now, 2 * months - 1);
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) keys.push(monthStart(now, i).toISOString().slice(0, 7));
  // Las partidas se cuentan hasta el fin del mes en curso (incluye las programadas para los próximos días)
  return { from, to: now, periodEnd: monthStart(now, -1), previousFrom, previousTo: from, months, keys };
}

/** Rellena con ceros los meses sin datos y respeta el orden del periodo. */
export function fillMonths<K extends string>(keys: string[], rows: ({ month: string } & Record<K, number>)[], fields: readonly K[]) {
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return keys.map((month) => {
    const row = byMonth.get(month);
    return { month, ...Object.fromEntries(fields.map((f) => [f, row ? row[f] : 0])) } as { month: string } & Record<K, number>;
  });
}

/** Proporción con 4 decimales; null cuando no hay base (no se muestra 0 % engañoso). */
export function ratio(part: number, total: number): number | null {
  return total > 0 ? Math.round((part / total) * 10_000) / 10_000 : null;
}

/** Variación relativa frente al periodo anterior; null si el anterior es cero. */
export function change(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 10_000) / 10_000;
}

/**
 * CSV compatible con Excel (BOM UTF-8, separador coma, CRLF). Las celdas que empiezan con = + - @ se prefijan
 * con ' para evitar inyección de fórmulas al abrir el archivo.
 */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------------------------

/** Etiquetas en español para los archivos exportados. */
const L: Record<string, Record<string, string>> = {
  tournament: { DRAFT: 'Borrador', OPEN: 'Abierta', IN_PROGRESS: 'En curso', FINISHED: 'Finalizada', CANCELLED: 'Cancelada' },
  format: {
    SINGLE_ELIMINATION: 'Eliminación directa',
    DOUBLE_ELIMINATION: 'Doble eliminación',
    ROUND_ROBIN: 'Liga (todos contra todos)',
    GROUPS: 'Fase de grupos',
    GROUPS_PLAYOFFS: 'Grupos + playoffs',
  },
  mode: { INDIVIDUAL: 'Individual', TEAM: 'Por equipos' },
  registration: { PENDING: 'Pendiente', APPROVED: 'Aprobada', REJECTED: 'Rechazada', WITHDRAWN: 'Retirada' },
  match: { PENDING: 'Por definir', SCHEDULED: 'Programado', LIVE: 'En vivo', COMPLETED: 'Jugado', CANCELLED: 'Cancelado' },
  bracket: { WINNERS: 'Ganadores', LOSERS: 'Perdedores', GRAND_FINAL: 'Gran final', GROUP: 'Grupos', LEAGUE: 'Liga', PLAYOFF: 'Playoffs' },
};
const label = (map: keyof typeof L, v: string) => L[map]![v] ?? v;

type Scope = { organizerId?: string };
const n = (v: unknown) => Number(v ?? 0);

/** Filtro por organizador sobre el alias de la tabla de torneos (vacío para estadísticas globales). */
const scoped = (s: Scope, alias = 't') =>
  s.organizerId ? Prisma.sql`${Prisma.raw(alias)}.organizer_id = ${s.organizerId}::uuid` : Prisma.sql`TRUE`;

/** Encuentros jugados (dos participantes, resultado oficial) con su fecha efectiva de juego. */
const playedCte = (s: Scope) => Prisma.sql`
  played AS (
    SELECT m.id, m.tournament_id,
      coalesce((SELECT min(mr.created_at) FROM match_results mr WHERE mr.match_id = m.id AND mr.status = 'VALIDATED'), m.updated_at) AS played_at,
      EXISTS (SELECT 1 FROM match_participants mp WHERE mp.match_id = m.id AND mp.is_winner) AS decided
    FROM matches m JOIN tournaments t ON t.id = m.tournament_id
    WHERE ${scoped(s)} AND m.status = 'COMPLETED'
      AND (SELECT count(*) FROM match_participants mp WHERE mp.match_id = m.id) = 2
  )`;

/** Fecha efectiva de una partida: su inicio, o su cierre si terminó antes de la fecha prevista. */
const tDate = (alias = 't') => Prisma.sql`least(${Prisma.raw(alias)}.starts_at, coalesce(${Prisma.raw(alias)}.ends_at, ${Prisma.raw(alias)}.starts_at))`;

const approvedCount = Prisma.sql`(SELECT count(*) FROM tournament_registrations r WHERE r.tournament_id = t.id AND r.status = 'APPROVED')`;

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Indicadores de un periodo [from, to). */
  async summary(s: Scope, from: Date, to: Date, tEnd: Date = to) {
    const sc = scoped(s);
    const [[t], regs, [occ], [matches], [people]] = await Promise.all([
      this.prisma.$queryRaw<{ created: bigint; finished: bigint; cancelled: bigint; started: bigint }[]>`
        SELECT
          count(*) FILTER (WHERE t.created_at >= ${from} AND t.created_at < ${to}) AS created,
          count(*) FILTER (WHERE t.status = 'FINISHED' AND ${tDate()} >= ${from} AND ${tDate()} < ${tEnd}) AS finished,
          count(*) FILTER (WHERE t.status = 'CANCELLED' AND ${tDate()} >= ${from} AND ${tDate()} < ${tEnd}) AS cancelled,
          count(*) FILTER (WHERE t.status IN ('OPEN', 'IN_PROGRESS', 'FINISHED') AND ${tDate()} >= ${from} AND ${tDate()} < ${tEnd}) AS started
        FROM tournaments t WHERE ${sc}`,
      this.prisma.$queryRaw<{ status: string; count: bigint }[]>`
        SELECT r.status::text AS status, count(*) AS count
        FROM tournament_registrations r JOIN tournaments t ON t.id = r.tournament_id
        WHERE ${sc} AND r.created_at >= ${from} AND r.created_at < ${to}
        GROUP BY r.status`,
      this.prisma.$queryRaw<{ capacity: bigint; filled: bigint }[]>`
        SELECT coalesce(sum(t.max_participants), 0) AS capacity, coalesce(sum(${approvedCount}), 0) AS filled
        FROM tournaments t
        WHERE ${sc} AND t.status IN ('OPEN', 'IN_PROGRESS', 'FINISHED') AND ${tDate()} >= ${from} AND ${tDate()} < ${tEnd}`,
      this.prisma.$queryRaw<{ total: bigint; draws: bigint }[]>`
        WITH ${playedCte(s)}
        SELECT count(*) AS total, count(*) FILTER (WHERE NOT decided) AS draws
        FROM played WHERE played_at >= ${from} AND played_at < ${to}`,
      this.prisma.$queryRaw<{ active: bigint; fresh: bigint; returning: bigint }[]>`
        WITH approved AS (
          SELECT coalesce(r.team_id, r.player_id) AS pid, r.tournament_id, r.created_at
          FROM tournament_registrations r JOIN tournaments t ON t.id = r.tournament_id
          WHERE ${sc} AND r.status = 'APPROVED' AND r.created_at < ${to}
        ), people AS (
          SELECT pid, min(created_at) AS first_at, count(DISTINCT tournament_id) AS tournaments,
            bool_or(created_at >= ${from}) AS active
          FROM approved GROUP BY pid
        )
        SELECT count(*) FILTER (WHERE active) AS active,
          count(*) FILTER (WHERE active AND first_at >= ${from}) AS fresh,
          count(*) FILTER (WHERE active AND tournaments >= 2) AS returning
        FROM people`,
    ]);

    const r = Object.fromEntries(regs.map((x) => [x.status, n(x.count)])) as Record<string, number>;
    const registrations = Object.values(r).reduce((a, b) => a + b, 0);
    const approved = r.APPROVED ?? 0;
    const rejected = r.REJECTED ?? 0;
    const active = n(people!.active);
    const fresh = n(people!.fresh);
    const returning = n(people!.returning);
    const played = n(matches!.total);
    return {
      tournamentsCreated: n(t!.created),
      tournamentsStarted: n(t!.started),
      tournamentsFinished: n(t!.finished),
      tournamentsCancelled: n(t!.cancelled),
      registrations,
      registrationsApproved: approved,
      registrationsRejected: rejected,
      registrationsPending: r.PENDING ?? 0,
      registrationsWithdrawn: r.WITHDRAWN ?? 0,
      approvalRate: ratio(approved, approved + rejected),
      capacity: n(occ!.capacity),
      occupancyRate: ratio(n(occ!.filled), n(occ!.capacity)),
      matchesPlayed: played,
      drawRate: ratio(n(matches!.draws), played),
      activeParticipants: active,
      newParticipants: fresh,
      // Recurrentes: activos en el periodo que ya jugaron más de una partida del organizador (hasta el fin del periodo)
      returningParticipants: returning,
      retentionRate: ratio(returning, active),
    };
  }

  /** Series mensuales del periodo. */
  async monthly(s: Scope, range: ReturnType<typeof statsRange>) {
    const sc = scoped(s);
    const { from, to, keys } = range;
    const [tournaments, registrations, matches] = await Promise.all([
      this.prisma.$queryRaw<{ month: string; tournaments: bigint }[]>`
        SELECT to_char(date_trunc('month', t.created_at), 'YYYY-MM') AS month, count(*) AS tournaments
        FROM tournaments t WHERE ${sc} AND t.created_at >= ${from} AND t.created_at < ${to} GROUP BY 1`,
      this.prisma.$queryRaw<{ month: string; registrations: bigint; approved: bigint }[]>`
        SELECT to_char(date_trunc('month', r.created_at), 'YYYY-MM') AS month, count(*) AS registrations,
          count(*) FILTER (WHERE r.status = 'APPROVED') AS approved
        FROM tournament_registrations r JOIN tournaments t ON t.id = r.tournament_id
        WHERE ${sc} AND r.created_at >= ${from} AND r.created_at < ${to} GROUP BY 1`,
      this.prisma.$queryRaw<{ month: string; matches: bigint }[]>`
        WITH ${playedCte(s)}
        SELECT to_char(date_trunc('month', played_at), 'YYYY-MM') AS month, count(*) AS matches
        FROM played WHERE played_at >= ${from} AND played_at < ${to} GROUP BY 1`,
    ]);
    const merged = new Map<string, { month: string; tournaments: number; registrations: number; approved: number; matches: number }>();
    const get = (month: string) => merged.get(month) ?? merged.set(month, { month, tournaments: 0, registrations: 0, approved: 0, matches: 0 }).get(month)!;
    for (const x of tournaments) get(x.month).tournaments = n(x.tournaments);
    for (const x of registrations) Object.assign(get(x.month), { registrations: n(x.registrations), approved: n(x.approved) });
    for (const x of matches) get(x.month).matches = n(x.matches);
    return fillMonths(keys, [...merged.values()], ['tournaments', 'registrations', 'approved', 'matches'] as const);
  }

  /** Torneos iniciados en el periodo agrupados por videojuego o deporte. */
  async byDiscipline(s: Scope, from: Date, tEnd: Date) {
    const rows = await this.prisma.$queryRaw<
      { name: string; category: string; tournaments: bigint; capacity: bigint; participants: bigint }[]
    >`
      SELECT coalesce(g.name, sp.name, 'Sin disciplina') AS name, t.category::text AS category, count(*) AS tournaments,
        coalesce(sum(t.max_participants), 0) AS capacity, coalesce(sum(${approvedCount}), 0) AS participants
      FROM tournaments t LEFT JOIN games g ON g.id = t.game_id LEFT JOIN sports sp ON sp.id = t.sport_id
      WHERE ${scoped(s)} AND t.status <> 'DRAFT' AND ${tDate()} >= ${from} AND ${tDate()} < ${tEnd}
      GROUP BY 1, 2 ORDER BY count(*) DESC, 1 LIMIT 12`;
    return rows.map((x) => ({
      name: x.name,
      category: x.category,
      tournaments: n(x.tournaments),
      participants: n(x.participants),
      occupancyRate: ratio(n(x.participants), n(x.capacity)),
    }));
  }

  /** Formatos de competición usados en el periodo. */
  async byFormat(s: Scope, from: Date, tEnd: Date) {
    const rows = await this.prisma.$queryRaw<{ format: string; mode: string; tournaments: bigint }[]>`
      SELECT t.format::text AS format, t.mode::text AS mode, count(*) AS tournaments
      FROM tournaments t
      WHERE ${scoped(s)} AND t.status <> 'DRAFT' AND ${tDate()} >= ${from} AND ${tDate()} < ${tEnd}
      GROUP BY 1, 2 ORDER BY 3 DESC`;
    return rows.map((x) => ({ format: x.format, mode: x.mode, tournaments: n(x.tournaments) }));
  }

  /** Equipos y jugadores con más victorias en encuentros jugados en el periodo, con títulos obtenidos. */
  async topParticipants(s: Scope, from: Date, to: Date, tEnd: Date = to, limit = 10) {
    const rows = await this.prisma.$queryRaw<
      { kind: string; id: string; name: string; slug: string | null; played: bigint; wins: bigint; titles: bigint }[]
    >`
      WITH ${playedCte(s)},
      results AS (
        SELECT coalesce(r.team_id, r.player_id) AS pid, (r.team_id IS NOT NULL) AS is_team, mp.is_winner
        FROM played p
        JOIN match_participants mp ON mp.match_id = p.id
        JOIN tournament_registrations r ON r.id = mp.registration_id
        WHERE p.played_at >= ${from} AND p.played_at < ${to}
      ),
      agg AS (
        SELECT pid, bool_or(is_team) AS is_team, count(*) AS played, count(*) FILTER (WHERE is_winner) AS wins
        FROM results GROUP BY pid
      )
      SELECT CASE WHEN a.is_team THEN 'TEAM' ELSE 'PLAYER' END AS kind, a.pid::text AS id,
        coalesce(tm.name, pl.nickname) AS name, tm.slug, a.played, a.wins,
        (SELECT count(*) FROM tournaments t JOIN tournament_registrations cr ON cr.id = t.champion_registration_id
          WHERE ${scoped(s)} AND coalesce(cr.team_id, cr.player_id) = a.pid
            AND ${tDate()} >= ${from} AND ${tDate()} < ${tEnd}) AS titles
      FROM agg a LEFT JOIN teams tm ON tm.id = a.pid LEFT JOIN players pl ON pl.id = a.pid
      ORDER BY a.wins DESC, titles DESC, a.played ASC, name
      LIMIT ${limit}`;
    return rows.map((x) => ({
      kind: x.kind as 'TEAM' | 'PLAYER',
      id: x.id,
      name: x.name,
      slug: x.slug,
      played: n(x.played),
      wins: n(x.wins),
      titles: n(x.titles),
      winRate: ratio(n(x.wins), n(x.played)),
    }));
  }

  /** Rendimiento por torneo iniciado en el periodo (el más reciente primero). */
  async tournaments(s: Scope, from: Date, tEnd: Date, limit = 25) {
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        name: string;
        slug: string;
        status: string;
        format: string;
        starts_at: Date;
        max_participants: number;
        approved: bigint;
        pending: bigint;
        matches_total: bigint;
        matches_done: bigint;
      }[]
    >`
      SELECT t.id::text AS id, t.name, t.slug, t.status::text AS status, t.format::text AS format, t.starts_at, t.max_participants,
        ${approvedCount} AS approved,
        (SELECT count(*) FROM tournament_registrations r WHERE r.tournament_id = t.id AND r.status = 'PENDING') AS pending,
        (SELECT count(*) FROM matches m WHERE m.tournament_id = t.id AND m.status <> 'CANCELLED') AS matches_total,
        (SELECT count(*) FROM matches m WHERE m.tournament_id = t.id AND m.status = 'COMPLETED') AS matches_done
      FROM tournaments t
      WHERE ${scoped(s)} AND t.status <> 'DRAFT' AND ${tDate()} >= ${from} AND ${tDate()} < ${tEnd}
      ORDER BY t.starts_at DESC LIMIT ${limit}`;
    return rows.map((x) => ({
      id: x.id,
      name: x.name,
      slug: x.slug,
      status: x.status,
      format: x.format,
      startsAt: x.starts_at,
      maxParticipants: x.max_participants,
      approved: n(x.approved),
      pending: n(x.pending),
      occupancyRate: ratio(n(x.approved), x.max_participants),
      matchesTotal: n(x.matches_total),
      matchesCompleted: n(x.matches_done),
      progress: ratio(n(x.matches_done), n(x.matches_total)),
    }));
  }

  /** Paquete completo del periodo con la comparación frente al periodo anterior. */
  async overview(s: Scope, months: number) {
    const range = statsRange(months);
    const [current, previous, monthly, byDiscipline, byFormat, top] = await Promise.all([
      this.summary(s, range.from, range.to, range.periodEnd),
      this.summary(s, range.previousFrom, range.previousTo),
      this.monthly(s, range),
      this.byDiscipline(s, range.from, range.periodEnd),
      this.byFormat(s, range.from, range.periodEnd),
      this.topParticipants(s, range.from, range.to, range.periodEnd),
    ]);
    const changes = Object.fromEntries(
      (Object.keys(current) as (keyof typeof current)[]).map((k) => [k, change(current[k], previous[k])]),
    ) as Record<keyof typeof current, number | null>;
    return {
      range: { months, from: range.from, to: range.to, periodEnd: range.periodEnd, previousFrom: range.previousFrom, previousTo: range.previousTo },
      summary: current,
      previous,
      changes,
      monthly,
      byDiscipline,
      byFormat,
      top,
    };
  }

  /** Estadísticas globales de la plataforma (SUPERADMIN). */
  async platform(months: number) {
    const range = statsRange(months);
    const { from, to, keys, periodEnd: tEnd } = range;
    const [base, users, signups, active, organizers, tournamentsByStatus, byCategory, topOrganizers] = await Promise.all([
      this.overview({}, months),
      this.prisma.user.groupBy({ by: ['role', 'status'], _count: true }),
      this.prisma.$queryRaw<{ month: string; users: bigint; organizers: bigint }[]>`
        SELECT to_char(date_trunc('month', u.created_at), 'YYYY-MM') AS month, count(*) AS users,
          count(*) FILTER (WHERE u.role = 'ORGANIZER') AS organizers
        FROM users u WHERE u.created_at >= ${from} AND u.created_at < ${to} GROUP BY 1`,
      this.prisma.user.count({ where: { status: 'ACTIVE', lastLoginAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
      this.prisma.organizerProfile.groupBy({ by: ['verificationStatus'], _count: true }),
      this.prisma.tournament.groupBy({ by: ['status'], _count: true }),
      this.prisma.$queryRaw<{ category: string; count: bigint }[]>`
        SELECT t.category::text AS category, count(*) AS count FROM tournaments t
        WHERE t.status <> 'DRAFT' AND ${tDate()} >= ${from} AND ${tDate()} < ${tEnd} GROUP BY 1`,
      this.prisma.$queryRaw<
        { id: string; display_name: string; username: string; tournaments: bigint; participants: bigint; matches: bigint }[]
      >`
        SELECT o.id::text AS id, o.display_name, u.username, count(t.id) AS tournaments,
          coalesce(sum(${approvedCount}), 0) AS participants,
          coalesce(sum((SELECT count(*) FROM matches m WHERE m.tournament_id = t.id AND m.status = 'COMPLETED')), 0) AS matches
        FROM organizer_profiles o JOIN users u ON u.id = o.user_id
        JOIN tournaments t ON t.organizer_id = o.id AND t.status <> 'DRAFT' AND ${tDate()} >= ${from} AND ${tDate()} < ${tEnd}
        GROUP BY o.id, o.display_name, u.username
        ORDER BY participants DESC, tournaments DESC LIMIT 10`,
    ]);

    const byRole: Record<string, number> = {};
    let suspended = 0;
    for (const u of users) {
      if (u.status === 'DELETED') continue;
      byRole[u.role] = (byRole[u.role] ?? 0) + u._count;
      if (u.status === 'SUSPENDED') suspended += u._count;
    }
    return {
      ...base,
      users: {
        total: Object.values(byRole).reduce((a, b) => a + b, 0),
        byRole,
        suspended,
        activeLast30Days: active,
        signups: fillMonths(
          keys,
          signups.map((x) => ({ month: x.month, users: n(x.users), organizers: n(x.organizers) })),
          ['users', 'organizers'] as const,
        ),
      },
      organizersByVerification: Object.fromEntries(organizers.map((o) => [o.verificationStatus, o._count])),
      tournamentsByStatus: Object.fromEntries(tournamentsByStatus.map((t) => [t.status, t._count])),
      tournamentsByCategory: Object.fromEntries(byCategory.map((c) => [c.category, n(c.count)])),
      topOrganizers: topOrganizers.map((o) => ({
        id: o.id,
        displayName: o.display_name,
        username: o.username,
        tournaments: n(o.tournaments),
        participants: n(o.participants),
        matchesPlayed: n(o.matches),
      })),
    };
  }

  /** Filas para exportar a CSV (máximo 10 000) de los torneos iniciados en el periodo. */
  async exportRows(organizerId: string, kind: ExportKind, months: number) {
    const { from, to, periodEnd: tEnd } = statsRange(months);
    const s = { organizerId };
    const dt = (d: Date | null) => (d ? d.toISOString().replace('T', ' ').slice(0, 16) : '');
    if (kind === 'tournaments') {
      const rows = await this.prisma.$queryRaw<
        {
          name: string; slug: string; status: string; format: string; mode: string; discipline: string | null;
          starts_at: Date; max_participants: number; approved: bigint; pending: bigint; done: bigint; total: bigint;
          entry_fee: string; currency: string; champion: string | null;
        }[]
      >`
        SELECT t.name, t.slug, t.status::text AS status, t.format::text AS format, t.mode::text AS mode,
          coalesce(g.name, sp.name) AS discipline, t.starts_at, t.max_participants, ${approvedCount} AS approved,
          (SELECT count(*) FROM tournament_registrations r WHERE r.tournament_id = t.id AND r.status = 'PENDING') AS pending,
          (SELECT count(*) FROM matches m WHERE m.tournament_id = t.id AND m.status = 'COMPLETED') AS done,
          (SELECT count(*) FROM matches m WHERE m.tournament_id = t.id AND m.status <> 'CANCELLED') AS total,
          trim_scale(t.entry_fee)::text AS entry_fee, t.currency,
          (SELECT coalesce(tm.name, pl.nickname) FROM tournament_registrations cr LEFT JOIN teams tm ON tm.id = cr.team_id
             LEFT JOIN players pl ON pl.id = cr.player_id WHERE cr.id = t.champion_registration_id) AS champion
        FROM tournaments t LEFT JOIN games g ON g.id = t.game_id LEFT JOIN sports sp ON sp.id = t.sport_id
        WHERE ${scoped(s)} AND ${tDate()} >= ${from} AND ${tDate()} < ${tEnd}
        ORDER BY t.starts_at DESC LIMIT 10000`;
      return toCsv(
        ['Torneo', 'Enlace', 'Estado', 'Formato', 'Modalidad', 'Disciplina', 'Inicio (UTC)', 'Cupo', 'Aprobados', 'Pendientes', 'Ocupación %', 'Encuentros jugados', 'Encuentros totales', 'Cuota de inscripción', 'Moneda', 'Campeón'],
        rows.map((x) => [
          x.name, `/torneos/${x.slug}`, label('tournament', x.status), label('format', x.format), label('mode', x.mode), x.discipline, dt(x.starts_at), x.max_participants, n(x.approved), n(x.pending),
          x.max_participants ? Math.round((n(x.approved) / x.max_participants) * 1000) / 10 : '', n(x.done), n(x.total), x.entry_fee, x.currency, x.champion,
        ]),
      );
    }
    if (kind === 'registrations') {
      const rows = await this.prisma.$queryRaw<
        { tournament: string; participant: string; is_team: boolean; status: string; created_at: Date; fee: string; currency: string; position: number | null }[]
      >`
        SELECT t.name AS tournament, coalesce(tm.name, pl.nickname) AS participant, (r.team_id IS NOT NULL) AS is_team,
          r.status::text AS status, r.created_at, trim_scale(r.fee_amount)::text AS fee, r.fee_currency AS currency, r.final_position AS position
        FROM tournament_registrations r JOIN tournaments t ON t.id = r.tournament_id
        LEFT JOIN teams tm ON tm.id = r.team_id LEFT JOIN players pl ON pl.id = r.player_id
        WHERE ${scoped(s)} AND r.created_at >= ${from} AND r.created_at < ${to}
        ORDER BY r.created_at DESC LIMIT 10000`;
      return toCsv(
        ['Torneo', 'Participante', 'Tipo', 'Estado', 'Solicitada (UTC)', 'Cuota de inscripción', 'Moneda', 'Posición final'],
        rows.map((x) => [x.tournament, x.participant, x.is_team ? 'Equipo' : 'Jugador', label('registration', x.status), dt(x.created_at), x.fee, x.currency, x.position]),
      );
    }
    const rows = await this.prisma.$queryRaw<
      { tournament: string; bracket: string; round: number; group_label: string | null; status: string; scheduled_at: Date | null;
        home: string | null; away: string | null; home_score: string | null; away_score: string | null; winner: string | null; played_at: Date | null }[]
    >`
      SELECT t.name AS tournament, m.bracket::text AS bracket, m.round, m.group_label, m.status::text AS status, m.scheduled_at,
        max(CASE WHEN mp.slot = 1 THEN coalesce(tm.name, pl.nickname) END) AS home,
        max(CASE WHEN mp.slot = 2 THEN coalesce(tm.name, pl.nickname) END) AS away,
        max(CASE WHEN mp.slot = 1 THEN trim_scale(mp.score)::text END) AS home_score,
        max(CASE WHEN mp.slot = 2 THEN trim_scale(mp.score)::text END) AS away_score,
        max(CASE WHEN mp.is_winner THEN coalesce(tm.name, pl.nickname) END) AS winner,
        (SELECT min(mr.created_at) FROM match_results mr WHERE mr.match_id = m.id AND mr.status = 'VALIDATED') AS played_at
      FROM matches m JOIN tournaments t ON t.id = m.tournament_id
      LEFT JOIN match_participants mp ON mp.match_id = m.id
      LEFT JOIN tournament_registrations r ON r.id = mp.registration_id
      LEFT JOIN teams tm ON tm.id = r.team_id LEFT JOIN players pl ON pl.id = r.player_id
      WHERE ${scoped(s)} AND ${tDate()} >= ${from} AND ${tDate()} < ${tEnd}
      GROUP BY m.id, t.name, t.starts_at
      ORDER BY t.starts_at DESC, t.name, m.bracket, m.round, m.position LIMIT 10000`;
    return toCsv(
      ['Torneo', 'Llave', 'Ronda', 'Grupo', 'Local', 'Visitante', 'Marcador local', 'Marcador visitante', 'Ganador', 'Estado', 'Programado (UTC)', 'Resultado (UTC)'],
      rows.map((x) => [
        x.tournament, label('bracket', x.bracket), x.round, x.group_label, x.home, x.away, x.home_score, x.away_score,
        x.winner ?? (x.status === 'COMPLETED' && x.home && x.away ? 'Empate' : ''), label('match', x.status), dt(x.scheduled_at), dt(x.played_at),
      ]),
    );
  }
}
