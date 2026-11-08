import type { Metadata } from 'next';
import Link from 'next/link';
import { Crown, GitCompareArrows, Info, Trophy } from 'lucide-react';
import { api, ApiError, qs } from '@/lib/api';
import type { Discipline, RankingSeason, RankingTable, RankingTableRow, RankingType } from '@/lib/types';
import { COUNTRIES, formatDate, formatDay, formatDateTime, formatPoints, MODE_LABEL, PLATFORM_LABEL, SEASON_STATUS_LABEL } from '@/lib/format';
import { EmptyState, Pagination } from '@/components/ui';
import { CountryCell, ParticipantCell, TrendBadge } from '@/components/ranking';
import { RankingLive } from '@/components/realtime';

export const metadata: Metadata = {
  title: 'Rankings',
  description: 'Clasificación global, nacional, por temporada e histórica de jugadores y equipos en cada videojuego.',
};

type Rule = {
  id: string;
  competitionType: 'INDIVIDUAL' | 'TEAM';
  version: number;
  minimumMatches: number;
  effectiveFrom: string;
  scoringConfiguration: { win?: number; draw?: number; participation?: number; placement?: Record<string, number>; tierMultiplier?: Record<string, number>; maxPerTournament?: number | null };
};

function record(r: RankingTableRow) {
  return `${r.wins}-${r.losses}${r.draws ? `-${r.draws}` : ''}`;
}

export default async function RankingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const games = await api<Discipline[]>('/games', { auth: false });
  const type: RankingType = sp.type === 'TEAM' ? 'TEAM' : 'PLAYER';
  const requestedGame = games.some((g) => g.id === sp.game) ? sp.game : undefined;
  const country = sp.country && COUNTRIES[sp.country] ? sp.country : undefined;

  let table: RankingTable;
  try {
    table = await api<RankingTable>('/rankings', {
      auth: false,
      query: { game: requestedGame, type, country, season: sp.season || undefined, platform: type === 'PLAYER' ? sp.platform || undefined : undefined, page: sp.page },
    });
  } catch (e) {
    if (!(e instanceof ApiError) || e.status >= 500) throw e;
    // Temporada de otro juego o inexistente: vuelve al histórico del juego elegido
    table = await api<RankingTable>('/rankings', { auth: false, query: { game: requestedGame, type, country } });
  }
  const game = table.game;
  const [seasons, rules] = await Promise.all([
    api<RankingSeason[]>('/rankings/seasons', { auth: false, query: { game: game.id } }),
    api<Rule[]>('/rankings/rules', { auth: false, query: { game: game.id } }),
  ]);
  const gameInfo = games.find((g) => g.id === game.id);
  const season = table.season;
  const query = { game: game.id, type, country, season: season?.id, platform: type === 'PLAYER' ? sp.platform : undefined };
  const noun = type === 'PLAYER' ? 'Jugador' : 'Equipo';
  const finished = season && (season.status === 'COMPLETED' || season.status === 'ARCHIVED');

  return (
    <div>
      <RankingLive gameId={game.id} />
      <h1 className="section-title">Rankings</h1>
      <p className="mt-2 max-w-3xl text-muted">
        Clasificación oficial por videojuego: solo cuentan resultados validados en torneos de la plataforma. Los puntos de un juego nunca
        se mezclan con los de otro, y los rangos oficiales de cada juego van aparte.
      </p>

      <form className="my-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <select name="game" defaultValue={game.id} className="input" aria-label="Videojuego">
          {games.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <select name="type" defaultValue={type} className="input" aria-label="Ranking individual o de equipos">
          <option value="PLAYER">Jugadores (individual)</option>
          <option value="TEAM">Equipos</option>
        </select>
        <select name="season" defaultValue={season?.id ?? ''} className="input" aria-label="Periodo">
          <option value="">Histórico acumulado</option>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.countryCode ? ` (${s.countryCode})` : ''} · {SEASON_STATUS_LABEL[s.status]}
            </option>
          ))}
        </select>
        <select name="country" defaultValue={country ?? ''} className="input" aria-label="País">
          <option value="">Global (todos los países)</option>
          {Object.entries(COUNTRIES).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        <select name="platform" defaultValue={sp.platform ?? ''} className="input" aria-label="Plataforma" disabled={type === 'TEAM'}>
          <option value="">{type === 'TEAM' ? 'Plataforma (solo jugadores)' : 'Cualquier plataforma'}</option>
          {(gameInfo?.platforms ?? Object.keys(PLATFORM_LABEL))
            .filter((k) => k !== 'NONE')
            .map((k) => (
              <option key={k} value={k}>
                {PLATFORM_LABEL[k]}
              </option>
            ))}
        </select>
        <button className="btn-primary">Ver ranking</button>
      </form>

      {finished && (season.champions?.player || season.champions?.team) && (
        <div className="card mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-amber/40 p-4">
          <Crown className="size-6 text-amber" aria-hidden />
          <p className="font-semibold">Campeones de {season.name}</p>
          {season.champions?.player && (
            <p className="text-sm">
              <span className="text-muted">Individual:</span> <b>{season.champions.player.name}</b>
            </p>
          )}
          {season.champions?.team && (
            <p className="text-sm">
              <span className="text-muted">Equipos:</span> <b>{season.champions.team.name}</b>
            </p>
          )}
        </div>
      )}

      <form id="compare" action="/rankings/comparar" className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <input type="hidden" name="game" value={game.id} />
        <input type="hidden" name="type" value={type} />
        {season && <input type="hidden" name="season" value={season.id} />}
        <h2 className="text-lg font-bold">
          {game.name} · {type === 'PLAYER' ? 'Jugadores' : 'Equipos'} · {country ? COUNTRIES[country] : 'Global'} ·{' '}
          {season ? `${season.name} (${formatDay(season.startDate)} – ${formatDay(season.endDate)})` : 'Histórico'}
        </h2>
        <p className="text-xs text-muted">{table.updatedAt ? `Actualizado ${formatDateTime(table.updatedAt)}` : 'Sin cálculos todavía'}</p>
        {table.items.length > 1 && (
          <button className="btn-ghost ml-auto px-3 py-1.5 text-xs">
            <GitCompareArrows className="size-4" /> Comparar seleccionados
          </button>
        )}
      </form>

      {table.items.length ? (
        <div className="relative overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[680px] text-sm">
            <caption className="sr-only">
              Ranking de {game.name}, {type === 'PLAYER' ? 'jugadores' : 'equipos'}
            </caption>
            <thead className="bg-surface-3 text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th scope="col" className="w-14 px-3 py-2.5 text-left">
                  Pos.
                </th>
                <th scope="col" className="px-3 py-2.5 text-left">
                  {noun}
                </th>
                <th scope="col" className="px-3 py-2.5 text-left">
                  País
                </th>
                <th scope="col" className="px-3 py-2.5 text-right">
                  Puntos
                </th>
                <th scope="col" className="px-3 py-2.5 text-right" title="Victorias-derrotas(-empates)">
                  V-D
                </th>
                <th scope="col" className="px-3 py-2.5 text-right">
                  Torneos
                </th>
                <th scope="col" className="px-3 py-2.5 text-left">
                  Evolución
                </th>
                <th scope="col" className="px-3 py-2.5 text-left">
                  <span className="sr-only">Comparar</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {table.items.map((r) => (
                <tr key={r.participantId} className="border-t border-line hover:bg-surface-2/60">
                  <td className="px-3 py-2 font-display text-lg font-bold tabular-nums">
                    {r.position === 1 ? <Trophy className="size-5 text-amber" aria-label="Primer puesto" /> : r.position}
                  </td>
                  <td className="max-w-[16rem] px-3 py-2">
                    <ParticipantCell type={type} participant={r.participant} />
                  </td>
                  <td className="px-3 py-2">
                    <CountryCell code={r.countryCode} />
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatPoints(r.points)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{record(r)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.tournamentsPlayed}
                    {r.tournamentsWon > 0 && <span className="text-xs text-amber"> · {r.tournamentsWon} 🏆</span>}
                  </td>
                  <td className="px-3 py-2">
                    <TrendBadge trend={r.trend} />
                  </td>
                  <td className="px-3 py-2">
                    <input type="checkbox" name="ids" value={r.participantId} form="compare" aria-label={`Comparar ${r.participant?.name ?? ''}`} className="accent-[var(--color-neon)]" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="Todavía nadie está clasificado">
          Para entrar al ranking oficial hacen falta al menos {table.minimumMatches} encuentros oficiales en {game.name}
          {type === 'PLAYER' ? ' y un perfil gamer de ese juego' : ''}.
        </EmptyState>
      )}
      <Pagination page={table.page} totalPages={table.totalPages} hrefFor={(p) => `/rankings${qs({ ...query, page: p })}`} />

      {table.provisional.length > 0 && (
        <details className="card mt-6 p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Provisionales: {table.provisional.length}{' '}
            {type === 'PLAYER' ? (table.provisional.length === 1 ? 'jugador' : 'jugadores') : table.provisional.length === 1 ? 'equipo' : 'equipos'} aún sin el
            mínimo de {table.minimumMatches} encuentros
          </summary>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {table.provisional.map((r) => (
              <li key={r.participantId} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                <ParticipantCell type={type} participant={r.participant} size={28} />
                <span className="shrink-0 text-xs text-muted tabular-nums">
                  {formatPoints(r.points)} pts · {r.matchesPlayed}/{table.minimumMatches}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <details className="card mt-4 p-4">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <Info className="size-4 text-neon" /> ¿Cómo se calculan los puntos en {game.name}?
        </summary>
        <div className="mt-3 space-y-3 text-sm text-muted">
          {rules.length ? (
            rules.map((r) => {
              const c = r.scoringConfiguration;
              return (
                <p key={r.id}>
                  <b className="text-ink">
                    {MODE_LABEL[r.competitionType]} · versión {r.version}
                  </b>{' '}
                  (desde {formatDay(r.effectiveFrom)}): victoria {c.win ?? 25}, empate {c.draw ?? 10}, participación {c.participation ?? 5} por
                  encuentro; puesto final{' '}
                  {Object.entries(c.placement ?? { 1: 100, 2: 60, 3: 40 })
                    .map(([k, v]) => `${k}.º ${v}`)
                    .join(', ')}
                  . El nivel del torneo multiplica los puntos
                  {c.tierMultiplier ? ` (${Object.entries(c.tierMultiplier).map(([k, v]) => `nivel ${k} ×${v}`).join(', ')})` : ''}
                  {c.maxPerTournament ? `; máximo ${c.maxPerTournament} puntos por torneo` : ''}. Mínimo {r.minimumMatches} encuentros para clasificar.
                </p>
              );
            })
          ) : (
            <p>Este juego usa la puntuación base: victoria 25, empate 10, participación 5, y 100/60/40 por los tres primeros puestos.</p>
          )}
          <p>
            La reputación, la verificación o el plan del organizador no influyen en los puntos. La evolución (↑ ↓ = NEW) compara la posición
            con el snapshot del día anterior. Si un resultado es incorrecto, sus participantes pueden reportarlo desde “Mi ranking”.
          </p>
        </div>
      </details>
    </div>
  );
}
