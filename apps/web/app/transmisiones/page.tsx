import type { Metadata } from 'next';
import Link from 'next/link';
import { Radio, Tv } from 'lucide-react';
import { api } from '@/lib/api';
import type { Discipline, Paginated, StreamListItem } from '@/lib/types';
import { StreamCard } from '@/components/stream';
import { StreamsLive } from '@/components/realtime';
import { EmptyState } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Transmisiones en vivo',
  description: 'Encuentros que se están transmitiendo ahora y próximas transmisiones de los torneos de Arena.',
};

export default async function StreamsPage({ searchParams }: { searchParams: Promise<{ game?: string }> }) {
  const { game } = await searchParams;
  const [live, upcoming, games] = await Promise.all([
    api<Paginated<StreamListItem>>('/streams/live', { auth: false, query: { game, pageSize: 24 } }),
    api<Paginated<StreamListItem>>('/streams/upcoming', { auth: false, query: { game, pageSize: 24 } }),
    api<Discipline[]>('/games', { auth: false }).catch(() => [] as Discipline[]),
  ]);

  return (
    <div className="space-y-8">
      <StreamsLive />
      <div className="flex flex-wrap items-end gap-4">
        <div className="mr-auto">
          <h1 className="section-title">Transmisiones</h1>
          <p className="mt-1 text-sm text-muted">Sigue los encuentros en YouTube, Twitch, Kick y otras plataformas. Se actualiza solo.</p>
        </div>
        {games.length > 0 && (
          <form className="flex items-end gap-2">
            <label className="block">
              <span className="label">Videojuego</span>
              <select name="game" defaultValue={game ?? ''} className="input w-56">
                <option value="">Todos</option>
                {games.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn-ghost">Filtrar</button>
          </form>
        )}
      </div>

      <section className="space-y-3" aria-labelledby="live-title">
        <h2 id="live-title" className="flex items-center gap-2 text-xl font-bold uppercase">
          <Radio className="size-5 text-danger" aria-hidden /> En vivo ahora
          <span className="text-sm font-normal text-muted">({live.total})</span>
        </h2>
        {live.items.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {live.items.map((s) => (
              <StreamCard key={s.id} item={s} />
            ))}
          </div>
        ) : (
          <EmptyState title="No hay encuentros en vivo en este momento">Revisa las próximas transmisiones o vuelve más tarde.</EmptyState>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="upcoming-title">
        <h2 id="upcoming-title" className="flex items-center gap-2 text-xl font-bold uppercase">
          <Tv className="size-5 text-amber" aria-hidden /> Próximamente
          <span className="text-sm font-normal text-muted">({upcoming.total})</span>
        </h2>
        {upcoming.items.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {upcoming.items.map((s) => (
              <StreamCard key={s.id} item={s} />
            ))}
          </div>
        ) : (
          <EmptyState title="No hay transmisiones programadas">
            Los organizadores agregan el enlace a cada encuentro desde su panel. <Link href="/torneos" className="text-neon">Ver torneos</Link>
          </EmptyState>
        )}
      </section>
    </div>
  );
}
