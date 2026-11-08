import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';
import { requireMe } from '@/lib/session';
import type { Discipline, LevelHistoryEntry, LevelThreshold, MyPlayer, Platform } from '@/lib/types';
import { formatDate, LEVEL_LABEL, LEVEL_SOURCE_LABEL } from '@/lib/format';
import { GameProfileCard } from '@/components/game-profile';
import { GameProfileForm, MoveGameButtons, PlayerSettingsForm, RemoveGameButton, type GameOption } from './game-forms';

export const metadata: Metadata = { title: 'Mis juegos' };

export default async function MyGamesPage() {
  const me = await requireMe('/dashboard/juegos');
  const [player, games, criteria, history] = await Promise.all([
    api<MyPlayer>('/me/player'),
    api<(Discipline & { platforms: Platform[] })[]>('/games', { auth: false }),
    api<LevelThreshold[]>('/players/level-criteria', { auth: false }),
    api<(LevelHistoryEntry & { id: string; game: { name: string } })[]>(`/players/${me.username}/game-history`).catch(() => []),
  ]);
  const order = player.gameProfiles.map((g) => g.id);
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
            {player.gameProfiles.map((g, i) => (
              <GameProfileCard key={g.id} profile={g}>
                {order.length > 1 && (
                  <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted">
                    Orden en tu perfil: {i + 1}
                    <MoveGameButtons id={g.id} order={order} index={i} />
                  </div>
                )}
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

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card min-w-0 space-y-3 p-5">
          <h2 className="text-lg font-bold uppercase">¿Cómo se verifica mi nivel?</h2>
          <ul className="space-y-1.5 text-sm">
            <li>
              <b>{LEVEL_SOURCE_LABEL.SELF_DECLARED}:</b> lo eliges tú y se muestra como declarado.
            </li>
            <li>
              <b>{LEVEL_SOURCE_LABEL.PLATFORM_VERIFIED}:</b> automático cuando tus estadísticas oficiales en ese juego (torneos finalizados)
              respaldan el nivel declarado.
            </li>
            <li>
              <b>{LEVEL_SOURCE_LABEL.EXTERNAL_VERIFIED}:</b> el equipo de la plataforma lo valida con una fuente externa autorizada.
            </li>
          </ul>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] text-xs">
              <caption className="sr-only">Umbrales para el respaldo de la plataforma</caption>
              <thead className="text-muted">
                <tr>
                  <th className="py-1 text-left">Nivel</th>
                  <th className="py-1 text-center">Partidas</th>
                  <th className="py-1 text-center">% victorias</th>
                  <th className="py-1 text-center">Títulos</th>
                </tr>
              </thead>
              <tbody>
                {[...criteria].reverse().map((c) => (
                  <tr key={c.level} className="border-t border-line">
                    <td className="py-1">{LEVEL_LABEL[c.level]}</td>
                    <td className="py-1 text-center tabular-nums">≥ {c.matches}</td>
                    <td className="py-1 text-center tabular-nums">{c.winRate ? `≥ ${c.winRate}%` : '—'}</td>
                    <td className="py-1 text-center tabular-nums">{c.titles ? `≥ ${c.titles}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">El rango de cada juego sigue siendo declarado salvo validación externa.</p>
        </div>
        <div className="card min-w-0 space-y-3 p-5">
          <h2 className="text-lg font-bold uppercase">Historial de nivel</h2>
          {history.length ? (
            <ol className="max-h-72 space-y-1.5 overflow-y-auto text-xs">
              {history.slice(0, 30).map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-x-2 rounded-lg bg-surface-2 px-2.5 py-1.5">
                  <span className="text-muted">{formatDate(h.recordedAt)}</span>
                  <b>{h.game.name}</b>
                  <span>
                    {h.newLevel ? LEVEL_LABEL[h.newLevel] : '—'}
                    {h.newRank && ` · ${h.newRank}`}
                  </span>
                  <span className="ml-auto text-muted">{LEVEL_SOURCE_LABEL[h.source]}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">Aún no hay cambios registrados.</p>
          )}
        </div>
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="text-xl font-bold uppercase">Agregar videojuego</h2>
        <GameProfileForm games={options.filter((g) => !used.has(g.id))} />
      </section>
    </div>
  );
}
