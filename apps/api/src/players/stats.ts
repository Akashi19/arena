import type { Prisma } from '../generated/prisma/client.js';

type Db = Prisma.TransactionClient;

export interface StatLine {
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  tournamentsPlayed: number;
  tournamentsWon: number;
  podiums: number;
  winRate: number;
}

export interface PlayerStats {
  overall: StatLine;
  /** Clave: gameId; los torneos de deportes tradicionales se agrupan en "sport". */
  byDiscipline: Map<string, StatLine>;
}

const empty = (): StatLine => ({ matchesPlayed: 0, wins: 0, draws: 0, losses: 0, tournamentsPlayed: 0, tournamentsWon: 0, podiums: 0, winRate: 0 });

/**
 * Estadísticas oficiales de un jugador: solo cuentan torneos FINALIZADOS. En partidas por equipos se
 * atribuyen al jugador si era integrante del equipo durante el torneo (historial de team_players).
 * Función pura sobre la base de datos: se usa tanto para la ficha pública como para materializar
 * `player_game_statistics` al cerrar cada torneo, así ambas fuentes nunca divergen.
 */
export async function computePlayerStats(db: Db, playerId: string): Promise<PlayerStats> {
  const regs = await db.tournamentRegistration.findMany({
    where: {
      status: 'APPROVED',
      tournament: { status: 'FINISHED' },
      OR: [{ playerId }, { team: { members: { some: { playerId } } } }],
    },
    select: {
      playerId: true,
      finalPosition: true,
      tournament: { select: { gameId: true, startsAt: true, endsAt: true } },
      team: { select: { members: { where: { playerId }, select: { joinedAt: true, leftAt: true } } } },
      participants: {
        where: { match: { status: 'COMPLETED' } },
        select: {
          isWinner: true,
          match: { select: { results: { where: { status: 'VALIDATED' }, take: 1, orderBy: { version: 'desc' }, select: { isDraw: true } } } },
        },
      },
    },
  });

  const overall = empty();
  const byDiscipline = new Map<string, StatLine>();
  for (const r of regs) {
    if (r.playerId !== playerId) {
      // Integrante del equipo durante el torneo
      const end = r.tournament.endsAt ?? r.tournament.startsAt;
      const member = r.team?.members.some((m) => m.joinedAt <= end && (!m.leftAt || m.leftAt >= r.tournament.startsAt));
      if (!member) continue;
    }
    const key = r.tournament.gameId ?? 'sport';
    const line = byDiscipline.get(key) ?? empty();
    byDiscipline.set(key, line);
    for (const target of [overall, line]) {
      target.tournamentsPlayed++;
      if (r.finalPosition === 1) target.tournamentsWon++;
      if (r.finalPosition && r.finalPosition <= 3) target.podiums++;
      for (const p of r.participants) {
        target.matchesPlayed++;
        if (p.isWinner === true) target.wins++;
        else if (p.isWinner === false) target.losses++;
        else if (p.match.results[0]?.isDraw) target.draws++;
      }
    }
  }
  for (const line of [overall, ...byDiscipline.values()]) {
    line.winRate = line.matchesPlayed ? Math.round((line.wins / line.matchesPlayed) * 10_000) / 100 : 0;
  }
  return { overall, byDiscipline };
}

const ACHIEVEMENT_RULES: { code: string; met: (s: StatLine) => boolean }[] = [
  { code: 'FIRST_TOURNAMENT', met: (s) => s.tournamentsPlayed >= 1 },
  { code: 'FIRST_WIN', met: (s) => s.wins >= 1 },
  { code: 'WINS_10', met: (s) => s.wins >= 10 },
  { code: 'WINS_50', met: (s) => s.wins >= 50 },
  { code: 'CHAMPION', met: (s) => s.tournamentsWon >= 1 },
];

/** Jugadores que participaron en el torneo (individualmente o como integrantes del equipo inscrito). */
export async function tournamentPlayerIds(db: Db, tournamentId: string): Promise<string[]> {
  const t = await db.tournament.findUniqueOrThrow({ where: { id: tournamentId }, select: { startsAt: true, endsAt: true } });
  const end = t.endsAt ?? new Date();
  const regs = await db.tournamentRegistration.findMany({
    where: { tournamentId, status: 'APPROVED' },
    select: {
      playerId: true,
      team: {
        select: {
          members: {
            where: { joinedAt: { lte: end }, OR: [{ leftAt: null }, { leftAt: { gte: t.startsAt } }] },
            select: { playerId: true },
          },
        },
      },
    },
  });
  return [...new Set(regs.flatMap((r) => (r.playerId ? [r.playerId] : (r.team?.members.map((m) => m.playerId) ?? []))))];
}

/**
 * Materializa `player_game_statistics` y desbloquea logros. Idempotente: recalcula desde cero, por lo
 * que puede ejecutarse varias veces (p. ej., si se corrige un resultado y se vuelve a cerrar).
 */
export async function refreshPlayerStats(db: Db, playerIds: string[]) {
  if (!playerIds.length) return;
  const achievements = await db.achievement.findMany({ where: { code: { in: ACHIEVEMENT_RULES.map((r) => r.code) } } });
  const byCode = new Map(achievements.map((a) => [a.code, a.id]));

  for (const playerId of playerIds) {
    const stats = await computePlayerStats(db, playerId);
    for (const [gameId, s] of stats.byDiscipline) {
      if (gameId === 'sport') continue; // la tabla es por videojuego
      const data = {
        matchesPlayed: s.matchesPlayed,
        wins: s.wins,
        losses: s.losses,
        draws: s.draws,
        tournamentsPlayed: s.tournamentsPlayed,
        tournamentsWon: s.tournamentsWon,
        winRate: s.winRate,
      };
      await db.playerGameStatistics.upsert({
        where: { playerId_gameId: { playerId, gameId } },
        update: data,
        create: { playerId, gameId, ...data },
      });
    }
    const unlocked = await db.playerAchievement.findMany({ where: { playerId, gameId: null }, select: { achievementId: true } });
    const have = new Set(unlocked.map((u) => u.achievementId));
    for (const rule of ACHIEVEMENT_RULES) {
      const achievementId = byCode.get(rule.code);
      if (achievementId && !have.has(achievementId) && rule.met(stats.overall)) {
        await db.playerAchievement.create({ data: { playerId, achievementId, gameId: null } });
      }
    }
  }
}
