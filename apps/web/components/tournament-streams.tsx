'use client';

import { useState } from 'react';
import clsx from 'clsx';
import type { TournamentStreams } from '@/lib/types';
import { StreamCard } from '@/components/stream';

const FILTERS = [
  { key: 'ALL', label: 'Todas' },
  { key: 'LIVE', label: 'En vivo' },
  { key: 'UPCOMING', label: 'Próximamente' },
  { key: 'ENDED', label: 'Finalizadas' },
] as const;

type Filter = (typeof FILTERS)[number]['key'];
const bucket = (status: string) => (status === 'SCHEDULED' ? 'UPCOMING' : status);

/** "Partidas transmitidas" del torneo con filtro EN VIVO / PRÓXIMAMENTE / FINALIZADAS. */
export function TournamentStreamsList({ data }: { data: TournamentStreams }) {
  const [filter, setFilter] = useState<Filter>(data.counts.LIVE ? 'LIVE' : 'ALL');
  const total = data.counts.LIVE + data.counts.UPCOMING + data.counts.ENDED;
  const items = filter === 'ALL' ? data.items : data.items.filter((s) => bucket(s.status) === filter);
  return (
    <div className="space-y-3">
      <div role="tablist" aria-label="Filtrar transmisiones" className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const count = f.key === 'ALL' ? total : data.counts[f.key];
          return (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={clsx(
                'rounded-full border px-3 py-1 text-xs font-semibold transition',
                filter === f.key ? 'border-neon bg-neon/10 text-neon' : 'border-line text-muted hover:text-ink',
              )}
            >
              {f.label} <span className="tabular-nums">({count})</span>
            </button>
          );
        })}
      </div>
      {items.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((s) => (
            <StreamCard key={s.id} item={s} showTournament={false} />
          ))}
        </div>
      ) : (
        <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted">No hay transmisiones en esta categoría.</p>
      )}
    </div>
  );
}
