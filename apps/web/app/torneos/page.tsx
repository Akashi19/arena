import type { Metadata } from 'next';
import { api, qs } from '@/lib/api';
import type { Discipline, Paginated, TournamentCard as Card } from '@/lib/types';
import { TournamentCard } from '@/components/tournament-card';
import { EmptyState, Pagination } from '@/components/ui';
import { TournamentFilters } from '@/components/tournament-filters';

export const metadata: Metadata = { title: 'Torneos' };

const KEYS = ['q', 'category', 'sport', 'game', 'country', 'city', 'from', 'to', 'mode', 'format', 'status', 'feeMin', 'feeMax', 'online', 'featured', 'verifiedOnly', 'sort', 'page'] as const;

export default async function TournamentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const query: Record<string, string> = {};
  for (const k of KEYS) {
    const v = sp[k];
    if (typeof v === 'string' && v) query[k] = v;
  }
  const [result, sports, games] = await Promise.all([
    api<Paginated<Card>>('/tournaments', { auth: false, query: { ...query, pageSize: 12 } }),
    api<Discipline[]>('/sports', { auth: false }),
    api<Discipline[]>('/games', { auth: false }),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="section-title">Explorar torneos</h1>
        <p className="mt-1 text-sm text-muted">
          {result.total} {result.total === 1 ? 'partida encontrada' : 'partidas encontradas'}
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <TournamentFilters sports={sports} games={games} />
        <div>
          {result.items.length ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {result.items.map((t) => (
                <TournamentCard key={t.id} t={t} />
              ))}
            </div>
          ) : (
            <EmptyState title="Sin resultados">Prueba con otros filtros o amplía el rango de fechas.</EmptyState>
          )}
          <Pagination page={result.page} totalPages={result.totalPages} hrefFor={(p) => `/torneos${qs({ ...query, page: p })}`} />
        </div>
      </div>
    </div>
  );
}
