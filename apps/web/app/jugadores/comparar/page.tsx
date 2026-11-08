import type { Metadata } from 'next';
import Link from 'next/link';
import { Crown, GitCompareArrows } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { Discipline, PlayerComparison } from '@/lib/types';
import { flag, formatDate, LEVEL_LABEL, LEVEL_SOURCE_LABEL, PLATFORM_LABEL } from '@/lib/format';
import { Avatar } from '@/components/ui';
import { LevelBar, LevelTag, SourceIcon } from '@/components/game-profile';

export const metadata: Metadata = {
  title: 'Comparar jugadores',
  description: 'Compara nivel, rango y estadísticas oficiales de jugadores dentro de un mismo videojuego.',
};

type Leader = keyof PlayerComparison['leaders'];
type Row = PlayerComparison['players'][number];

const ROWS: { key: Leader | null; label: string; value: (p: Row) => React.ReactNode }[] = [
  { key: 'level', label: 'Nivel', value: (p) => (p.profile ? <LevelTag profile={p.profile} /> : '—') },
  { key: 'rank', label: 'Rango', value: (p) => p.profile?.rank?.rankName ?? '—' },
  { key: null, label: 'Plataforma', value: (p) => (p.profile ? PLATFORM_LABEL[p.profile.platform] : '—') },
  { key: null, label: 'Rol', value: (p) => p.profile?.playerRole ?? '—' },
  { key: 'matchesPlayed', label: 'Partidas oficiales', value: (p) => p.stats?.matchesPlayed ?? 'Privado' },
  { key: 'wins', label: 'Victorias', value: (p) => (p.stats ? `${p.stats.wins} · ${p.stats.losses} D${p.stats.draws ? ` · ${p.stats.draws} E` : ''}` : 'Privado') },
  { key: 'winRate', label: '% de victorias', value: (p) => (p.stats ? (p.stats.matchesPlayed ? `${p.stats.winRate.toFixed(1)}%` : '—') : 'Privado') },
  { key: null, label: 'Torneos disputados', value: (p) => p.stats?.tournamentsPlayed ?? 'Privado' },
  { key: 'tournamentsWon', label: 'Torneos ganados', value: (p) => p.stats?.tournamentsWon ?? 'Privado' },
];

function list(v: string | string[] | undefined) {
  const raw = Array.isArray(v) ? v : (v ?? '').split(',');
  return [...new Set(raw.map((x) => x.trim().toLowerCase()).filter(Boolean))].slice(0, 4);
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ game?: string; players?: string | string[] }> }) {
  const sp = await searchParams;
  const players = list(sp.players);
  const games = await api<Discipline[]>('/games', { auth: false });
  const gameId = games.some((g) => g.id === sp.game) ? sp.game : undefined;

  let data: PlayerComparison | null = null;
  let error: string | null = null;
  if (gameId && players.length >= 2) {
    try {
      data = await api<PlayerComparison>('/players/compare', { query: { game: gameId, players: players.join(',') } });
    } catch (e) {
      if (!(e instanceof ApiError) || e.status >= 500) throw e;
      error = e.message;
    }
  } else if (sp.game || sp.players) {
    error = !gameId ? 'Elige un videojuego.' : 'Elige al menos 2 jugadores distintos.';
  }

  return (
    <div>
      <p className="text-sm text-muted">
        <Link href="/jugadores" className="hover:text-ink">
          Jugadores
        </Link>{' '}
        / Comparar
      </p>
      <h1 className="section-title mt-1">Comparar jugadores</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Compara hasta 4 jugadores dentro de un mismo videojuego. Los rangos y estadísticas de juegos distintos no son equivalentes, por
        eso no se mezclan.
      </p>

      <form className="card my-6 grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <select name="game" defaultValue={gameId ?? ''} className="input sm:col-span-2" aria-label="Videojuego" required>
          <option value="">Elige un videojuego</option>
          {games.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        {[0, 1, 2, 3].map((i) => (
          <input
            key={i}
            name="players"
            defaultValue={players[i] ?? ''}
            placeholder={`Usuario ${i + 1}${i < 2 ? '' : ' (opcional)'}`}
            aria-label={`Usuario del jugador ${i + 1}`}
            required={i < 2}
            maxLength={30}
            className="input"
          />
        ))}
        <button className="btn-primary sm:col-span-2 lg:col-span-6 lg:ml-auto lg:w-fit">
          <GitCompareArrows className="size-4" /> Comparar
        </button>
      </form>

      {error && <p className="card border-danger/40 p-4 text-sm text-danger">{error}</p>}

      {data && (
        <div className="space-y-6">
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[560px] text-sm">
              <caption className="sr-only">Comparación en {data.game.name}</caption>
              <thead className="bg-surface-3">
                <tr>
                  <th scope="col" className="w-40 px-3 py-3 text-left text-[11px] uppercase tracking-wider text-muted">
                    {data.game.name}
                  </th>
                  {data.players.map((p) => (
                    <th key={p.username} scope="col" className="px-3 py-3 text-left">
                      <Link href={`/jugadores/${p.username}`} className="flex items-center gap-2 hover:text-neon">
                        <Avatar src={p.avatarUrl} name={p.nickname} size={34} rounded="full" />
                        <span className="min-w-0">
                          <span className="block truncate font-bold">
                            {p.nickname} <span className="text-xs">{flag(p.country)}</span>
                          </span>
                          <span className="block truncate text-xs font-normal text-muted">{p.profile?.gamerTag ?? `@${p.username}`}</span>
                        </span>
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.label} className="border-t border-line">
                    <th scope="row" className="px-3 py-2 text-left text-xs font-normal text-muted">
                      {row.label}
                    </th>
                    {data!.players.map((p) => {
                      const lead = row.key && data!.leaders[row.key]?.includes(p.username);
                      return (
                        <td key={p.username} className={`px-3 py-2 tabular-nums ${lead ? 'bg-neon/5 font-semibold' : ''}`}>
                          <span className="inline-flex items-center gap-1.5">
                            {row.value(p)}
                            {lead && <Crown className="size-3.5 text-amber" aria-label="Mejor valor" />}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="border-t border-line">
                  <th scope="row" className="px-3 py-2 text-left text-xs font-normal text-muted">
                    Origen del nivel
                  </th>
                  {data.players.map((p) => (
                    <td key={p.username} className="px-3 py-2 text-xs">
                      {p.profile ? (
                        <span className="inline-flex items-center gap-1">
                          <SourceIcon type={p.profile.verificationType} />
                          {LEVEL_SOURCE_LABEL[p.profile.verificationType]} · {formatDate(p.profile.verifiedAt ?? p.profile.lastUpdatedAt)}
                        </span>
                      ) : (
                        <span className="text-muted">Sin perfil público en este juego</span>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          {!data.game.hasRanks && <p className="text-xs text-muted">{data.game.name} no tiene un catálogo de rangos configurado.</p>}

          <section>
            <h2 className="text-xl font-bold uppercase">Evolución competitiva</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {data.players.map((p) => (
                <div key={p.username} className="card space-y-3 p-4">
                  <p className="font-bold">{p.nickname}</p>
                  {p.profile && (
                    <div className="text-neon">
                      <LevelBar level={p.profile.competitiveLevel} />
                    </div>
                  )}
                  {p.evolution === null ? (
                    <p className="text-xs text-muted">Historial privado.</p>
                  ) : p.evolution.length ? (
                    <ol className="space-y-1 text-xs">
                      {p.evolution.slice(-6).map((h, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="w-20 shrink-0 text-muted">{formatDate(h.recordedAt)}</span>
                          <span className="min-w-0 truncate">
                            {h.newLevel ? LEVEL_LABEL[h.newLevel] : '—'}
                            {h.newRank && ` · ${h.newRank}`}
                          </span>
                          <span className="ml-auto shrink-0 text-muted">{LEVEL_SOURCE_LABEL[h.source]}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-xs text-muted">Sin cambios de nivel registrados.</p>
                  )}
                  {p.results && p.results.length > 0 && (
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted">Últimos torneos</p>
                      <ul className="mt-1 flex flex-wrap gap-1.5">
                        {p.results.map((r) => (
                          <li key={r.tournament.slug}>
                            <Link
                              href={`/torneos/${r.tournament.slug}`}
                              title={`${r.tournament.name} · ${formatDate(r.tournament.startsAt)}`}
                              className={`chip px-2 py-0.5 ${r.finalPosition === 1 ? 'border-amber/50 text-amber' : ''}`}
                            >
                              {r.finalPosition ? `${r.finalPosition}º` : '—'}/{r.participants}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
