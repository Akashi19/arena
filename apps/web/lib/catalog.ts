import 'server-only';
import { api } from './api';
import type { Discipline } from './types';

export interface RankOption {
  id: string;
  rankName: string;
  rankOrder: number;
}

export type GameWithRanks = Discipline & { platforms: string[]; ranks: RankOption[] };

/** Videojuegos activos con su catálogo de rangos ordenado (cada juego tiene el suyo). */
export async function gamesWithRanks(): Promise<GameWithRanks[]> {
  const games = await api<(Discipline & { platforms: string[] })[]>('/games', { auth: false });
  const ranks = await Promise.all(games.map((g) => api<RankOption[]>(`/games/${g.id}/ranks`, { auth: false }).catch(() => [])));
  return games.map((g, i) => ({ ...g, ranks: ranks[i]!.sort((a, b) => a.rankOrder - b.rankOrder) }));
}
