import type { Prisma } from '../generated/prisma/client.js';
import type { RankingEventType, RankingType, TournamentMode } from '../generated/prisma/enums.js';

/**
 * Motor de ranking (módulo 22). Funciones puras sobre la base de datos para que el servicio Nest, el
 * recálculo administrativo y el seed usen exactamente el mismo cálculo.
 *
 * Reglas:
 * - Solo puntúan torneos FINALIZADOS, de videojuego, marcados como `isRanked`, y solo encuentros con un
 *   resultado VALIDATED. Los puntos de un juego nunca se mezclan con los de otro.
 * - Cada resultado genera eventos con una `event_reference` determinista: volver a procesar un torneo no
 *   duplica puntos. Si cambia algo que altera la puntuación (regla, nivel del torneo, corrección), el evento
 *   anterior se marca revertido y se crea uno nuevo: el historial nunca se borra.
 * - Un mismo resultado cuenta una vez como encuentro (victoria/empate/derrota + participación) y el puesto
 *   final una vez como evento de torneo; `maxPerTournament` limita lo que puede aportar una sola competición.
 * - Los rankings (histórico y temporadas activas) se reconstruyen desde los eventos no revertidos.
 * - La reputación del organizador, su verificación y su plan no intervienen en ningún cálculo.
 */

type Db = Prisma.TransactionClient;

export interface ScoringConfig {
  win: number;
  draw: number;
  loss: number;
  participation: number;
  /** Puntos por puesto final: { "1": 100, "2": 60, "3": 40 } */
  placement: Record<string, number>;
  /** Multiplicador por nivel del torneo (1..5) */
  tierMultiplier: Record<string, number>;
  /** Tope de puntos que un participante puede sumar en un mismo torneo (null = sin tope) */
  maxPerTournament: number | null;
}

export const DEFAULT_SCORING: ScoringConfig = {
  win: 25,
  draw: 10,
  loss: 0,
  participation: 5,
  placement: { '1': 100, '2': 60, '3': 40 },
  tierMultiplier: { '1': 1, '2': 1.25, '3': 1.5, '4': 2, '5': 3 },
  maxPerTournament: null,
};
export const DEFAULT_MINIMUM_MATCHES = 5;

const isInt = (n: unknown, min: number, max: number) => typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max;
const isNum = (n: unknown, min: number, max: number) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;

/** Errores de una configuración de puntuación enviada por el SUPERADMIN (vacío = válida). */
export function scoringErrors(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['La configuración debe ser un objeto'];
  const c = raw as Record<string, unknown>;
  const errors: string[] = [];
  for (const k of ['win', 'draw', 'loss', 'participation'] as const) {
    if (c[k] !== undefined && !isInt(c[k], 0, 1000)) errors.push(`${k} debe ser un entero entre 0 y 1000`);
  }
  if (c.placement !== undefined) {
    if (!c.placement || typeof c.placement !== 'object' || Array.isArray(c.placement)) errors.push('placement debe ser un objeto');
    else
      for (const [k, v] of Object.entries(c.placement)) {
        if (!/^[1-9]\d?$/.test(k) || !isInt(v, 0, 10_000)) errors.push(`placement.${k} no es válido (puesto 1-99, puntos 0-10000)`);
      }
  }
  if (c.tierMultiplier !== undefined) {
    if (!c.tierMultiplier || typeof c.tierMultiplier !== 'object' || Array.isArray(c.tierMultiplier)) errors.push('tierMultiplier debe ser un objeto');
    else
      for (const [k, v] of Object.entries(c.tierMultiplier)) {
        if (!/^[1-5]$/.test(k) || !isNum(v, 0, 10)) errors.push(`tierMultiplier.${k} no es válido (nivel 1-5, factor 0-10)`);
      }
  }
  if (c.maxPerTournament !== undefined && c.maxPerTournament !== null && !isInt(c.maxPerTournament, 1, 100_000)) {
    errors.push('maxPerTournament debe ser null o un entero entre 1 y 100000');
  }
  const known = new Set(['win', 'draw', 'loss', 'participation', 'placement', 'tierMultiplier', 'maxPerTournament']);
  for (const k of Object.keys(c)) if (!known.has(k)) errors.push(`Clave desconocida: ${k}`);
  return errors;
}

/** Configuración efectiva: lo no indicado toma el valor por defecto. */
export function parseScoring(raw: unknown): ScoringConfig {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Partial<ScoringConfig>;
  return {
    win: c.win ?? DEFAULT_SCORING.win,
    draw: c.draw ?? DEFAULT_SCORING.draw,
    loss: c.loss ?? DEFAULT_SCORING.loss,
    participation: c.participation ?? DEFAULT_SCORING.participation,
    placement: c.placement ?? DEFAULT_SCORING.placement,
    tierMultiplier: c.tierMultiplier ?? DEFAULT_SCORING.tierMultiplier,
    maxPerTournament: c.maxPerTournament ?? null,
  };
}

export interface AppliedRule {
  version: number;
  config: ScoringConfig;
  minimumMatches: number;
}

/** Versión de la regla vigente en una fecha: ACTIVE con `effectiveFrom` ≤ fecha (la más reciente). */
export async function ruleFor(db: Db, gameId: string, mode: TournamentMode, at: Date): Promise<AppliedRule> {
  const rule = await db.rankingRule.findFirst({
    where: { gameId, competitionType: mode, status: 'ACTIVE', effectiveFrom: { lte: at } },
    orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
  });
  if (!rule) return { version: 0, config: DEFAULT_SCORING, minimumMatches: DEFAULT_MINIMUM_MATCHES };
  return { version: rule.version, config: parseScoring(rule.scoringConfiguration), minimumMatches: rule.minimumMatches };
}

export interface DesiredEvent {
  eventType: RankingEventType;
  rankingType: RankingType;
  participantId: string;
  gameId: string;
  tournamentId: string;
  matchId: string | null;
  pointsAwarded: number;
  placement: number | null;
  scoringRulesVersion: number;
  eventReference: string;
}

/** Ventana de pertenencia al equipo durante el torneo (misma regla que las estadísticas oficiales). */
function memberDuring(m: { joinedAt: Date; leftAt: Date | null }, start: Date, end: Date) {
  return m.joinedAt <= end && (!m.leftAt || m.leftAt >= start);
}

/**
 * Alineación por encuentro: en partidas por equipos registra qué integrantes representaban al equipo en
 * cada encuentro (los puntos del equipo quedan trazables a sus jugadores aunque luego cambie la plantilla).
 */
async function ensureLineups(db: Db, tournamentId: string, start: Date, end: Date) {
  const matches = await db.match.findMany({
    where: { tournamentId, status: 'COMPLETED' },
    select: {
      id: true,
      lineups: { select: { registrationId: true } },
      participants: {
        select: { registrationId: true, registration: { select: { team: { select: { members: { select: { playerId: true, joinedAt: true, leftAt: true } } } } } } },
      },
    },
  });
  const rows: { matchId: string; registrationId: string; playerId: string }[] = [];
  for (const m of matches) {
    const recorded = new Set(m.lineups.map((l) => l.registrationId));
    for (const p of m.participants) {
      if (recorded.has(p.registrationId)) continue;
      for (const member of p.registration.team?.members ?? []) {
        if (memberDuring(member, start, end)) rows.push({ matchId: m.id, registrationId: p.registrationId, playerId: member.playerId });
      }
    }
  }
  if (rows.length) await db.matchLineup.createMany({ data: rows, skipDuplicates: true });
}

/** Eventos que un torneo debe haber generado según las reglas vigentes (vacío si no puntúa). */
export async function tournamentEvents(db: Db, tournamentId: string): Promise<{ gameId: string | null; events: DesiredEvent[] }> {
  const t = await db.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
    select: { id: true, gameId: true, mode: true, tier: true, isRanked: true, status: true, startsAt: true, endsAt: true },
  });
  if (!t.gameId || !t.isRanked || t.status !== 'FINISHED') return { gameId: t.gameId, events: [] };
  const gameId = t.gameId;
  const at = t.endsAt ?? t.startsAt;
  const rule = await ruleFor(db, gameId, t.mode, at);
  const cfg = rule.config;
  const mult = cfg.tierMultiplier[String(t.tier)] ?? 1;
  const team = t.mode === 'TEAM';

  const regs = await db.tournamentRegistration.findMany({
    where: { tournamentId, status: 'APPROVED' },
    select: { id: true, playerId: true, teamId: true, finalPosition: true },
  });
  const regById = new Map(regs.map((r) => [r.id, r]));
  const matches = await db.match.findMany({
    where: { tournamentId, status: 'COMPLETED' },
    orderBy: [{ round: 'asc' }, { position: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      participants: { select: { registrationId: true, isWinner: true } },
      lineups: { select: { registrationId: true, playerId: true } },
      results: { where: { status: 'VALIDATED' }, orderBy: { version: 'desc' }, take: 1, select: { version: true, isDraw: true } },
    },
  });

  // Jugadores que representaron a cada inscripción (para el ranking individual en partidas por equipos)
  const lineupByReg = new Map<string, Set<string>>();
  for (const m of matches) {
    for (const l of m.lineups) {
      const set = lineupByReg.get(l.registrationId) ?? new Set<string>();
      set.add(l.playerId);
      lineupByReg.set(l.registrationId, set);
    }
  }
  const targets = (regId: string, matchLineup?: { registrationId: string; playerId: string }[]) => {
    const r = regById.get(regId);
    if (!r) return [];
    if (!team) return r.playerId ? [{ type: 'PLAYER' as const, id: r.playerId }] : [];
    const players = matchLineup ? matchLineup.filter((l) => l.registrationId === regId).map((l) => l.playerId) : [...(lineupByReg.get(regId) ?? [])];
    return [...(r.teamId ? [{ type: 'TEAM' as const, id: r.teamId }] : []), ...players.map((id) => ({ type: 'PLAYER' as const, id }))];
  };

  const events: DesiredEvent[] = [];
  const earned = new Map<string, number>(); // tope por torneo y participante
  const push = (
    eventType: RankingEventType,
    target: { type: RankingType; id: string },
    base: number,
    matchId: string | null,
    refPart: string,
    placement: number | null = null,
  ) => {
    let points = Math.round(base * mult);
    const key = `${target.type}:${target.id}`;
    const soFar = earned.get(key) ?? 0;
    if (cfg.maxPerTournament !== null) points = Math.max(0, Math.min(points, cfg.maxPerTournament - soFar));
    earned.set(key, soFar + points);
    events.push({
      eventType,
      rankingType: target.type,
      participantId: target.id,
      gameId,
      tournamentId,
      matchId,
      pointsAwarded: points,
      placement,
      scoringRulesVersion: rule.version,
      eventReference: `t:${tournamentId}:${refPart}:${eventType}:${target.type}:${target.id}:v${rule.version}:${points}`,
    });
  };

  for (const m of matches) {
    const result = m.results[0];
    if (!result || m.participants.length !== 2) continue; // sin resultado oficial no hay puntos
    for (const p of m.participants) {
      const outcome: RankingEventType | null =
        p.isWinner === true ? 'MATCH_WIN' : p.isWinner === false ? 'MATCH_LOSS' : result.isDraw ? 'MATCH_DRAW' : null;
      if (!outcome) continue;
      const base = outcome === 'MATCH_WIN' ? cfg.win : outcome === 'MATCH_DRAW' ? cfg.draw : cfg.loss;
      for (const target of targets(p.registrationId, team ? m.lineups : undefined)) {
        push(outcome, target, base, m.id, `m:${m.id}:r${result.version}`);
        push('MATCH_PARTICIPATION', target, cfg.participation, m.id, `m:${m.id}:r${result.version}`);
      }
    }
  }
  for (const r of regs) {
    if (!r.finalPosition) continue;
    for (const target of targets(r.id)) {
      push('TOURNAMENT_PLACEMENT', target, cfg.placement[String(r.finalPosition)] ?? 0, null, `place:${r.finalPosition}`, r.finalPosition);
    }
  }
  return { gameId, events };
}

/**
 * Sincroniza los eventos de un torneo (idempotente). Devuelve el juego afectado y si hubo cambios.
 * Las reversiones administrativas (`revertedById`) nunca se deshacen automáticamente.
 */
export async function syncTournament(db: Db, tournamentId: string) {
  const t = await db.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
    select: { mode: true, status: true, isRanked: true, gameId: true, startsAt: true, endsAt: true },
  });
  if (t.mode === 'TEAM' && t.status === 'FINISHED' && t.gameId) await ensureLineups(db, tournamentId, t.startsAt, t.endsAt ?? new Date());
  const { gameId, events } = await tournamentEvents(db, tournamentId);
  const existing = await db.rankingEvent.findMany({
    where: { tournamentId, eventType: { not: 'ADJUSTMENT' } },
    select: { id: true, eventReference: true, isReverted: true, revertedById: true, gameId: true },
  });
  const desired = new Set(events.map((e) => e.eventReference));
  const known = new Set(existing.map((e) => e.eventReference));
  const revert = existing.filter((e) => !e.isReverted && !desired.has(e.eventReference)).map((e) => e.id);
  const restore = existing.filter((e) => e.isReverted && !e.revertedById && desired.has(e.eventReference)).map((e) => e.id);
  const create = events.filter((e) => !known.has(e.eventReference));
  if (revert.length) await db.rankingEvent.updateMany({ where: { id: { in: revert } }, data: { isReverted: true } });
  if (restore.length) await db.rankingEvent.updateMany({ where: { id: { in: restore } }, data: { isReverted: false } });
  if (create.length) await db.rankingEvent.createMany({ data: create, skipDuplicates: true });
  return {
    gameId: gameId ?? existing[0]?.gameId ?? null,
    created: create.length,
    reverted: revert.length,
    restored: restore.length,
  };
}

// =========================================================================== Clasificaciones

export interface RankingRowInput {
  participantId: string;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  matchesPlayed: number;
  tournamentsPlayed: number;
  tournamentsWon: number;
  countryCode: string | null;
  eligible: boolean;
}

export interface PositionedRow extends RankingRowInput {
  positionGlobal: number | null;
  positionCountry: number | null;
}

/** Orden: puntos, victorias, títulos. Empate en los tres = misma posición (1, 2, 2, 4). */
export function compareRows(a: RankingRowInput, b: RankingRowInput) {
  return b.points - a.points || b.wins - a.wins || b.tournamentsWon - a.tournamentsWon;
}

export function assignPositions(rows: RankingRowInput[]): PositionedRow[] {
  const out: PositionedRow[] = rows.map((r) => ({ ...r, positionGlobal: null, positionCountry: null }));
  const rank = (list: PositionedRow[], set: (r: PositionedRow, p: number) => void) => {
    const sorted = [...list].sort(compareRows);
    let previous = 0;
    sorted.forEach((r, i) => {
      previous = i > 0 && compareRows(sorted[i - 1], r) === 0 ? previous : i + 1;
      set(r, previous);
    });
  };
  const eligible = out.filter((r) => r.eligible);
  rank(eligible, (r, p) => (r.positionGlobal = p));
  const byCountry = new Map<string, PositionedRow[]>();
  for (const r of eligible) {
    if (r.countryCode) byCountry.set(r.countryCode, [...(byCountry.get(r.countryCode) ?? []), r]);
  }
  for (const list of byCountry.values()) rank(list, (r, p) => (r.positionCountry = p));
  return out;
}

/** Fecha UTC sin hora (clave diaria de los snapshots). */
export const snapshotDay = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

interface Scope {
  seasonId: string | null;
  from: Date | null;
  to: Date | null;
  country: string | null;
  minimum: Record<RankingType, number>;
}

export function isRankingSuspended(until: Date | null, now = new Date()) {
  return !!until && until > now;
}

/**
 * Reconstruye el ranking histórico acumulado y el de cada temporada ACTIVE del juego (más las indicadas en
 * `includeSeasons`, p. ej. la que se está cerrando) desde los eventos no revertidos, asigna posiciones globales
 * y nacionales y guarda el snapshot del día. Idempotente.
 */
export async function recomputeGame(db: Db, gameId: string, includeSeasons: string[] = [], now = new Date()) {
  const events = await db.rankingEvent.findMany({
    where: { gameId, isReverted: false },
    select: {
      eventType: true,
      rankingType: true,
      participantId: true,
      tournamentId: true,
      pointsAwarded: true,
      placement: true,
      createdAt: true,
      tournament: { select: { startsAt: true, endsAt: true } },
    },
  });
  const seasons = await db.rankingSeason.findMany({
    where: { gameId, OR: [{ status: 'ACTIVE' }, { id: { in: includeSeasons } }] },
  });
  const playerIds = [...new Set(events.filter((e) => e.rankingType === 'PLAYER').map((e) => e.participantId))];
  const teamIds = [...new Set(events.filter((e) => e.rankingType === 'TEAM').map((e) => e.participantId))];
  const players = await db.player.findMany({
    where: { id: { in: playerIds } },
    select: {
      id: true,
      country: true,
      isSuspended: true,
      rankingSuspendedUntil: true,
      user: { select: { status: true } },
      gameProfiles: { where: { gameId, isActive: true }, select: { id: true } },
    },
  });
  const teams = await db.team.findMany({
    where: { id: { in: teamIds } },
    select: { id: true, country: true, isActive: true, rankingSuspendedUntil: true },
  });
  const meta = new Map<string, { country: string | null; canRank: boolean }>();
  for (const p of players) {
    meta.set(`PLAYER:${p.id}`, {
      country: p.country,
      // Elegibilidad: perfil gamer del juego, cuenta activa y sin suspensión (general o del ranking)
      canRank: p.gameProfiles.length > 0 && !p.isSuspended && p.user?.status !== 'SUSPENDED' && !isRankingSuspended(p.rankingSuspendedUntil, now),
    });
  }
  for (const t of teams) meta.set(`TEAM:${t.id}`, { country: t.country, canRank: t.isActive && !isRankingSuspended(t.rankingSuspendedUntil, now) });

  const [individual, teamRule] = [await ruleFor(db, gameId, 'INDIVIDUAL', now), await ruleFor(db, gameId, 'TEAM', now)];
  const scopes: Scope[] = [
    { seasonId: null, from: null, to: null, country: null, minimum: { PLAYER: individual.minimumMatches, TEAM: teamRule.minimumMatches } },
    ...seasons.map((s) => ({
      seasonId: s.id,
      from: s.startDate,
      to: s.endDate,
      country: s.countryCode,
      minimum: { PLAYER: s.minimumMatches, TEAM: s.minimumMatches },
    })),
  ];
  const day = snapshotDay(now);

  for (const scope of scopes) {
    const agg = new Map<string, RankingRowInput & { type: RankingType; tournaments: Set<string> }>();
    for (const e of events) {
      const key = `${e.rankingType}:${e.participantId}`;
      const m = meta.get(key);
      if (!m) continue;
      const at = e.tournament ? (e.tournament.endsAt ?? e.tournament.startsAt) : e.createdAt;
      if ((scope.from && at < scope.from) || (scope.to && at > scope.to)) continue;
      if (scope.country && m.country !== scope.country) continue;
      let row = agg.get(key);
      if (!row) {
        row = {
          type: e.rankingType,
          participantId: e.participantId,
          points: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          matchesPlayed: 0,
          tournamentsPlayed: 0,
          tournamentsWon: 0,
          countryCode: m.country,
          eligible: false,
          tournaments: new Set(),
        };
        agg.set(key, row);
      }
      row.points += e.pointsAwarded;
      if (e.eventType === 'MATCH_WIN') row.wins++;
      if (e.eventType === 'MATCH_LOSS') row.losses++;
      if (e.eventType === 'MATCH_DRAW') row.draws++;
      if (e.eventType === 'TOURNAMENT_PLACEMENT' && e.placement === 1) row.tournamentsWon++;
      if (e.tournamentId && e.eventType !== 'ADJUSTMENT') row.tournaments.add(e.tournamentId);
    }
    for (const row of agg.values()) {
      row.matchesPlayed = row.wins + row.losses + row.draws;
      row.tournamentsPlayed = row.tournaments.size;
      row.eligible = !!meta.get(`${row.type}:${row.participantId}`)?.canRank && row.matchesPlayed >= scope.minimum[row.type];
    }

    for (const type of ['PLAYER', 'TEAM'] as const) {
      const rows = assignPositions([...agg.values()].filter((r) => r.type === type));
      const data = rows.map((r) => ({
        gameId,
        seasonId: scope.seasonId,
        countryCode: r.countryCode,
        points: r.points,
        wins: r.wins,
        losses: r.losses,
        draws: r.draws,
        matchesPlayed: r.matchesPlayed,
        tournamentsPlayed: r.tournamentsPlayed,
        tournamentsWon: r.tournamentsWon,
        isProvisional: !r.eligible,
        positionGlobal: r.positionGlobal,
        positionCountry: r.positionCountry,
        lastCalculatedAt: now,
      }));
      if (type === 'PLAYER') {
        await db.playerRanking.deleteMany({ where: { gameId, seasonId: scope.seasonId } });
        if (data.length) await db.playerRanking.createMany({ data: data.map((d, i) => ({ ...d, playerId: rows[i].participantId })) });
      } else {
        await db.teamRanking.deleteMany({ where: { gameId, seasonId: scope.seasonId } });
        if (data.length) await db.teamRanking.createMany({ data: data.map((d, i) => ({ ...d, teamId: rows[i].participantId })) });
      }
      // Snapshot del día: base de la evolución (↑ ↓ = NEW) y de los gráficos; nunca se estima
      await db.rankingSnapshot.deleteMany({ where: { rankingType: type, gameId, seasonId: scope.seasonId, snapshotDate: day } });
      const snaps = rows
        .filter((r) => r.positionGlobal !== null)
        .map((r) => ({
          rankingType: type,
          participantId: r.participantId,
          gameId,
          seasonId: scope.seasonId,
          countryCode: r.countryCode,
          points: r.points,
          position: r.positionGlobal!,
          snapshotDate: day,
        }));
      if (snaps.length) await db.rankingSnapshot.createMany({ data: snaps });
    }
  }
  return { players: playerIds.length, teams: teamIds.length, seasons: seasons.length };
}

// =========================================================================== Evolución

export type TrendStatus = 'UP' | 'DOWN' | 'SAME' | 'NEW';

/** Variación entre la posición del snapshot anterior y la actual (positivo = subió). */
export function trendOf(previous: number | null | undefined, current: number | null): { status: TrendStatus; delta: number } {
  if (current === null) return { status: 'SAME', delta: 0 };
  if (previous === null || previous === undefined) return { status: 'NEW', delta: 0 };
  const delta = previous - current;
  return { status: delta > 0 ? 'UP' : delta < 0 ? 'DOWN' : 'SAME', delta };
}
