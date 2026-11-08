import Link from 'next/link';
import { Crown, Medal } from 'lucide-react';
import { api } from '@/lib/api';
import type { CompetitiveProfile, RankingHistory, RankingType } from '@/lib/types';
import { formatDate, formatDay, formatPoints, RANKING_EVENT_LABEL, SEASON_STATUS_LABEL } from '@/lib/format';
import { TrendBadge } from '@/components/ranking';
import { RankingChart } from '@/components/ranking-chart';
import { ReportResultButton } from '@/components/report-result';

function Cell({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wider text-muted">{label}</p>
      <p className="font-display text-xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

const pos = (p: number | null | undefined, provisional?: boolean) => (provisional ? 'Prov.' : p ? `#${p}` : '—');

/**
 * Ranking competitivo de un jugador o equipo: posición global, nacional y de la temporada actual por cada
 * videojuego, evolución (snapshots semanales), historial de temporadas y últimos movimientos de puntos.
 */
export async function CompetitiveRanking({
  type,
  participantId,
  profile,
  reportable = false,
  title = 'Ranking competitivo',
}: {
  type: RankingType;
  participantId: string;
  profile: CompetitiveProfile;
  reportable?: boolean;
  title?: string;
}) {
  const histories = await Promise.all(
    profile.games.map((g) => api<RankingHistory>(`/rankings/history/${participantId}`, { auth: false, query: { type, game: g.game.id } })),
  );

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold">{title}</h2>
      {profile.games.length === 0 && (
        <p className="card p-4 text-sm text-muted">
          Sin puntos de ranking todavía. Se suman al disputar torneos oficiales que puntúan.{' '}
          <Link href="/rankings" className="text-neon">
            Ver rankings
          </Link>
        </p>
      )}
      {profile.games.map((g, i) => {
        const h = g.historic;
        const history = histories[i];
        const provisional = !!h?.isProvisional;
        return (
          <article key={g.game.id} className="card min-w-0 space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold">{g.game.name}</h3>
              <TrendBadge trend={g.trend} />
              {provisional && <span className="chip">Provisional: aún no cumple el mínimo de encuentros</span>}
              <Link href={`/rankings?game=${g.game.id}&type=${type}`} className="ml-auto text-xs text-neon">
                Ver clasificación
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Cell label="Global" value={pos(h?.positionGlobal, provisional)} />
              <Cell label="País" value={pos(h?.positionCountry, provisional)} hint={h?.countryCode ?? undefined} />
              <Cell
                label="Temporada actual"
                value={g.currentSeason ? pos(g.currentSeason.row.positionGlobal, g.currentSeason.row.isProvisional) : '—'}
                hint={g.currentSeason ? `${g.currentSeason.season.name} · ${formatPoints(g.currentSeason.row.points)} pts` : 'Sin temporada activa'}
              />
              <Cell label="Puntos (histórico)" value={formatPoints(h?.points ?? 0)} />
              <Cell label="Victorias / derrotas" value={`${h?.wins ?? 0} / ${h?.losses ?? 0}`} hint={h?.draws ? `${h.draws} empates` : undefined} />
              <Cell label="Torneos" value={h?.tournamentsPlayed ?? 0} />
              <Cell label="Títulos" value={h?.tournamentsWon ?? 0} />
              <Cell label="Encuentros" value={h?.matchesPlayed ?? 0} />
            </div>

            {history.weekly.length > 0 && (
              <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                <RankingChart title="Puntos por semana" valueLabel="puntos" series={[{ id: 'points', label: 'Puntos', points: history.weekly.map((w) => ({ x: w.week, y: w.points })) }]} />
                <RankingChart title="Posición global por semana" valueLabel="posición" invert series={[{ id: 'pos', label: 'Posición', points: history.weekly.map((w) => ({ x: w.week, y: w.position })) }]} />
              </div>
            )}
            {history.weekly.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-xs text-muted">Ver datos de la evolución en tabla</summary>
                <table className="mt-2 w-full max-w-md text-xs">
                  <thead className="text-muted">
                    <tr>
                      <th className="py-1 text-left font-normal">Semana</th>
                      <th className="py-1 text-right font-normal">Puntos</th>
                      <th className="py-1 text-right font-normal">Posición</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.weekly.map((w) => (
                      <tr key={w.week} className="border-t border-line">
                        <td className="py-1">{formatDay(w.week)}</td>
                        <td className="py-1 text-right tabular-nums">{formatPoints(w.points)}</td>
                        <td className="py-1 text-right tabular-nums">#{w.position}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}

            {g.seasons.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Historial de temporadas</p>
                <ul className="space-y-1.5">
                  {g.seasons.map((s) => (
                    <li key={s.season.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                      {s.isChampion ? <Crown className="size-4 text-amber" aria-label="Campeón" /> : <Medal className="size-4 text-muted" aria-hidden />}
                      <Link href={`/rankings?game=${g.game.id}&type=${type}&season=${s.season.id}`} className="font-semibold hover:text-neon">
                        {s.season.name}
                        {s.season.countryCode ? ` (${s.season.countryCode})` : ''}
                      </Link>
                      <span className="text-xs text-muted">{SEASON_STATUS_LABEL[s.season.status]}</span>
                      <span className="ml-auto tabular-nums">
                        {pos(s.row.positionGlobal, s.row.isProvisional)} · {formatPoints(s.row.points)} pts
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        );
      })}

      {profile.events.length > 0 && (
        <div className="card p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Últimos movimientos de puntos</p>
          <ul className="divide-y divide-line text-sm">
            {profile.events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className={`w-14 shrink-0 text-right font-semibold tabular-nums ${e.isReverted ? 'text-muted line-through' : e.pointsAwarded > 0 ? 'text-lime' : e.pointsAwarded < 0 ? 'text-danger' : 'text-muted'}`}>
                  {e.pointsAwarded > 0 ? '+' : ''}
                  {e.pointsAwarded}
                </span>
                <span className="min-w-0 flex-1">
                  {RANKING_EVENT_LABEL[e.eventType]}
                  {e.placement ? ` ${e.placement}.º` : ''} · {e.game.name}
                  {e.tournament && (
                    <>
                      {' · '}
                      <Link href={`/torneos/${e.tournament.slug}`} className="text-muted hover:text-ink">
                        {e.tournament.name}
                      </Link>
                    </>
                  )}
                  {e.isReverted && <span className="block text-xs text-muted">Revertido{e.revertReason ? `: ${e.revertReason}` : ''}</span>}
                </span>
                <span className="text-xs text-muted">{formatDate(e.createdAt)}</span>
                {reportable && e.matchId && !e.isReverted && (e.eventType === 'MATCH_WIN' || e.eventType === 'MATCH_LOSS' || e.eventType === 'MATCH_DRAW') && (
                  <ReportResultButton matchId={e.matchId} />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
