import type { Metadata } from 'next';
import Link from 'next/link';
import { Crown } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { RankingComparison, RankingRowData, RankingType } from '@/lib/types';
import { formatPoints } from '@/lib/format';
import { CountryCell, ParticipantCell } from '@/components/ranking';
import { RankingChart } from '@/components/ranking-chart';

export const metadata: Metadata = {
  title: 'Comparar en el ranking',
  description: 'Compara posición, puntos y evolución de jugadores o equipos de un mismo videojuego.',
};

const ROWS: { key: string; label: string; value: (r: RankingRowData | null) => React.ReactNode }[] = [
  { key: 'position', label: 'Posición global', value: (r) => (r ? (r.isProvisional ? 'Provisional' : `#${r.positionGlobal}`) : 'Sin puntos') },
  { key: 'points', label: 'Puntos', value: (r) => formatPoints(r?.points ?? 0) },
  { key: 'wins', label: 'Victorias', value: (r) => r?.wins ?? 0 },
  { key: 'losses', label: 'Derrotas', value: (r) => r?.losses ?? 0 },
  { key: 'matchesPlayed', label: 'Encuentros', value: (r) => r?.matchesPlayed ?? 0 },
  { key: 'tournamentsPlayed', label: 'Torneos', value: (r) => r?.tournamentsPlayed ?? 0 },
  { key: 'tournamentsWon', label: 'Títulos', value: (r) => r?.tournamentsWon ?? 0 },
];

export default async function CompareRankingPage({ searchParams }: { searchParams: Promise<{ game?: string; type?: string; season?: string; ids?: string | string[] }> }) {
  const sp = await searchParams;
  const type: RankingType = sp.type === 'TEAM' ? 'TEAM' : 'PLAYER';
  const ids = [...new Set((Array.isArray(sp.ids) ? sp.ids : (sp.ids ?? '').split(',')).filter(Boolean))].slice(0, 4);
  const back = `/rankings?game=${sp.game ?? ''}&type=${type}${sp.season ? `&season=${sp.season}` : ''}`;

  let data: RankingComparison | null = null;
  let error: string | null = null;
  if (!sp.game || ids.length < 2) error = 'Marca entre 2 y 4 participantes en la tabla del ranking para compararlos.';
  else {
    try {
      data = await api<RankingComparison>('/rankings/compare', { auth: false, query: { game: sp.game, type, season: sp.season, ids: ids.join(',') } });
    } catch (e) {
      if (!(e instanceof ApiError) || e.status >= 500) throw e;
      error = e.message;
    }
  }

  return (
    <div>
      <p className="text-sm text-muted">
        <Link href={back} className="hover:text-ink">
          Rankings
        </Link>{' '}
        / Comparar
      </p>
      <h1 className="section-title mt-1">Comparar en el ranking{data ? ` de ${data.game.name}` : ''}</h1>
      {error && <p className="card mt-6 border-danger/40 p-4 text-sm text-danger">{error}</p>}
      {data && (
        <div className="mt-6 space-y-6">
          <div className="relative overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[560px] text-sm">
              <caption className="sr-only">Comparación de ranking en {data.game.name}</caption>
              <thead className="bg-surface-3">
                <tr>
                  <th scope="col" className="w-36 px-3 py-3 text-left text-[11px] uppercase tracking-wider text-muted">
                    {data.seasonId ? 'Temporada' : 'Histórico'}
                  </th>
                  {data.items.map((i) => (
                    <th key={i.participant.id} scope="col" className="max-w-[12rem] px-3 py-3 text-left">
                      <ParticipantCell type={type} participant={i.participant} size={30} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-line">
                  <th scope="row" className="px-3 py-2 text-left text-xs font-normal text-muted">
                    País
                  </th>
                  {data.items.map((i) => (
                    <td key={i.participant.id} className="px-3 py-2">
                      <CountryCell code={i.participant.country} />
                    </td>
                  ))}
                </tr>
                {ROWS.map((row) => (
                  <tr key={row.key} className="border-t border-line">
                    <th scope="row" className="px-3 py-2 text-left text-xs font-normal text-muted">
                      {row.label}
                    </th>
                    {data!.items.map((i) => {
                      const lead = data!.leaders[row.key]?.includes(i.participant.id);
                      return (
                        <td key={i.participant.id} className={`px-3 py-2 tabular-nums ${lead ? 'bg-neon/5 font-semibold' : ''}`}>
                          <span className="inline-flex items-center gap-1.5">
                            {row.value(i.row)}
                            {lead && <Crown className="size-3.5 text-amber" aria-label="Mejor valor" />}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card grid min-w-0 gap-6 p-4 lg:grid-cols-2">
            <RankingChart
              title="Puntos por semana"
              valueLabel="puntos"
              series={data.items.map((i) => ({ id: i.participant.id, label: i.participant.name, points: i.history.map((w) => ({ x: w.week, y: w.points })) }))}
            />
            <RankingChart
              title="Posición por semana"
              valueLabel="posición"
              invert
              series={data.items.map((i) => ({ id: i.participant.id, label: i.participant.name, points: i.history.map((w) => ({ x: w.week, y: w.position })) }))}
            />
          </div>
        </div>
      )}
    </div>
  );
}
