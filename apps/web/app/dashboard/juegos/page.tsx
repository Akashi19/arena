import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';
import { requireMe } from '@/lib/session';
import type { Discipline, MyPlayer, Platform } from '@/lib/types';
import { GameProfileCard } from '@/components/game-profile';
import { GameProfileForm, PlayerSettingsForm, RemoveGameButton, type GameOption } from './game-forms';

export const metadata: Metadata = { title: 'Mis juegos' };

export default async function MyGamesPage() {
  const me = await requireMe('/dashboard/juegos');
  const [player, games] = await Promise.all([
    api<MyPlayer>('/me/player'),
    api<(Discipline & { platforms: Platform[] })[]>('/games', { auth: false }),
  ]);
  const ranks = await Promise.all(
    games.map((g) => api<{ id: string; rankName: string; rankOrder: number }[]>(`/games/${g.id}/ranks`, { auth: false }).catch(() => [])),
  );
  const options: GameOption[] = games.map((g, i) => ({
    id: g.id,
    name: g.name,
    platforms: g.platforms,
    ranks: ranks[i].sort((a, b) => a.rankOrder - b.rankOrder).map((r) => ({ id: r.id, name: r.rankName })),
  }));
  const used = new Set(player.gameProfiles.map((g) => g.game.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="section-title">Mis juegos</h1>
          <p className="mt-1 text-sm text-muted">
            Tu perfil gamer: los organizadores lo usan para validar el nivel requerido en cada partida.
          </p>
        </div>
        <Link href={`/jugadores/${me.username}`} className="text-sm text-neon hover:underline">
          Ver mi perfil público
        </Link>
      </div>

      <PlayerSettingsForm player={player} />

      <section className="space-y-3">
        <h2 className="text-xl font-bold uppercase">Videojuegos ({player.gameProfiles.length})</h2>
        {player.gameProfiles.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {player.gameProfiles.map((g) => (
              <GameProfileCard key={g.id} profile={g}>
                <details className="mt-3 border-t border-line pt-3">
                  <summary className="cursor-pointer text-sm font-semibold text-neon">Editar</summary>
                  <div className="mt-3 space-y-3">
                    <GameProfileForm games={options} profile={g} />
                    <RemoveGameButton id={g.id} name={g.game.name} />
                  </div>
                </details>
              </GameProfileCard>
            ))}
          </div>
        ) : (
          <p className="card p-5 text-sm text-muted">Agrega tu primer videojuego para aparecer en la búsqueda de jugadores.</p>
        )}
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="text-xl font-bold uppercase">Agregar videojuego</h2>
        <GameProfileForm games={options.filter((g) => !used.has(g.id))} />
      </section>
    </div>
  );
}
