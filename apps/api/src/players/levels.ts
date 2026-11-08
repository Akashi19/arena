import type { Prisma } from '../generated/prisma/client.js';
import type { CompetitiveLevel } from '../generated/prisma/enums.js';
import { levelIndex } from '../common/utils/access.js';

type Db = Prisma.TransactionClient;

export interface LevelEvidence {
  matchesPlayed: number;
  winRate: number; // 0-100
  tournamentsWon: number;
}

/**
 * Umbrales del nivel PLATFORM_VERIFIED. Solo se consideran estadísticas oficiales del videojuego
 * (torneos finalizados de la plataforma). Se evalúan de mayor a menor y gana el primero que se cumple.
 * Sin un mínimo de partidas no hay evidencia suficiente para respaldar ningún nivel.
 */
export const LEVEL_THRESHOLDS: { level: CompetitiveLevel; matches: number; winRate: number; titles: number }[] = [
  { level: 'PROFESSIONAL', matches: 60, winRate: 65, titles: 3 },
  { level: 'EXPERT', matches: 30, winRate: 58, titles: 1 },
  { level: 'ADVANCED', matches: 15, winRate: 50, titles: 0 },
  { level: 'INTERMEDIATE', matches: 8, winRate: 35, titles: 0 },
  { level: 'BEGINNER', matches: 5, winRate: 0, titles: 0 },
];

/** Nivel máximo que las estadísticas oficiales respaldan, o null si aún no hay evidencia suficiente. */
export function supportedLevel(e: LevelEvidence | null | undefined): CompetitiveLevel | null {
  if (!e) return null;
  const hit = LEVEL_THRESHOLDS.find((t) => e.matchesPlayed >= t.matches && e.winRate >= t.winRate && e.tournamentsWon >= t.titles);
  return hit?.level ?? null;
}

/** Texto de origen visible en el perfil: deja claro qué respalda la verificación y qué no. */
export function platformSource(e: LevelEvidence) {
  const titles = e.tournamentsWon ? `, ${e.tournamentsWon} ${e.tournamentsWon === 1 ? 'título' : 'títulos'}` : '';
  return `Estadísticas oficiales: ${e.matchesPlayed} partidas, ${Number(e.winRate).toFixed(0)}% de victorias${titles}`;
}

/**
 * Sincroniza el tipo de verificación de los perfiles gamer con las estadísticas oficiales:
 * - SELF_DECLARED → PLATFORM_VERIFIED si el nivel declarado está respaldado (igual o inferior al soportado).
 * - PLATFORM_VERIFIED → SELF_DECLARED si deja de estarlo (p. ej., subió su nivel declarado).
 * - EXTERNAL_VERIFIED no se toca: solo lo cambia un SUPERADMIN o una edición del propio jugador.
 * Cada cambio de tipo queda en `player_game_history`.
 */
export async function syncLevelVerification(db: Db, playerIds: string[]) {
  if (!playerIds.length) return;
  // Consultas secuenciales: puede ejecutarse dentro de una transacción (una sola conexión)
  const profiles = await db.playerGameProfile.findMany({
    where: { playerId: { in: playerIds }, isActive: true, verificationType: { not: 'EXTERNAL_VERIFIED' } },
    include: { rank: { select: { rankName: true } } },
  });
  const stats = await db.playerGameStatistics.findMany({ where: { playerId: { in: playerIds } } });
  for (const p of profiles) {
    const s = stats.find((x) => x.playerId === p.playerId && x.gameId === p.gameId);
    const evidence = s ? { matchesPlayed: s.matchesPlayed, winRate: Number(s.winRate), tournamentsWon: s.tournamentsWon } : null;
    const supported = supportedLevel(evidence);
    const verified = !!supported && levelIndex(p.competitiveLevel) <= levelIndex(supported);

    if (verified) {
      const source = platformSource(evidence!);
      if (p.verificationType === 'PLATFORM_VERIFIED' && p.verificationSource === source) continue;
      await db.playerGameProfile.update({
        where: { id: p.id },
        data: {
          verificationType: 'PLATFORM_VERIFIED',
          verificationSource: source,
          ...(p.verificationType !== 'PLATFORM_VERIFIED' ? { verifiedAt: new Date() } : {}),
        },
      });
      if (p.verificationType !== 'PLATFORM_VERIFIED') await logChange(db, p, 'PLATFORM_VERIFIED');
    } else if (p.verificationType === 'PLATFORM_VERIFIED') {
      await db.playerGameProfile.update({
        where: { id: p.id },
        data: { verificationType: 'SELF_DECLARED', verificationSource: null, verifiedAt: null },
      });
      await logChange(db, p, 'SELF_DECLARED');
    }
  }
}

function logChange(
  db: Db,
  p: { playerId: string; gameId: string; competitiveLevel: CompetitiveLevel; rank: { rankName: string } | null },
  source: 'PLATFORM_VERIFIED' | 'SELF_DECLARED',
) {
  return db.playerGameHistory.create({
    data: {
      playerId: p.playerId,
      gameId: p.gameId,
      previousLevel: p.competitiveLevel,
      newLevel: p.competitiveLevel,
      previousRank: p.rank?.rankName ?? null,
      newRank: p.rank?.rankName ?? null,
      source,
    },
  });
}
