import type { Metadata } from 'next';
import Link from 'next/link';
import { PlusCircle } from 'lucide-react';
import { api, qs } from '@/lib/api';
import { requireOrganizer } from '@/lib/session';
import type { Paginated, TournamentCard, TournamentStatus } from '@/lib/types';
import { formatDateTime, formatMoney, STATUS_LABEL } from '@/lib/format';
import { EmptyState, Pagination, StatusBadge } from '@/components/ui';

export const metadata: Metadata = { title: 'Mis partidas' };

export default async function MyTournamentsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string; q?: string }> }) {
  await requireOrganizer('/dashboard/torneos');
  const sp = await searchParams;
  const data = await api<Paginated<TournamentCard>>('/me/tournaments', { query: { ...sp, pageSize: 20 } });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="section-title">Mis partidas</h1>
        <Link href="/dashboard/torneos/nuevo" className="btn-primary">
          <PlusCircle className="size-4" /> Crear partida
        </Link>
      </div>
      <nav className="flex flex-wrap gap-2">
        {[['', 'Todas'], ...Object.entries(STATUS_LABEL)].map(([value, label]) => (
          <Link
            key={value}
            href={`/dashboard/torneos${qs({ status: value })}`}
            className={`chip px-3 py-1.5 ${(sp.status ?? '') === value ? 'border-neon text-neon' : ''}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {data.items.length ? (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="p-3">Partida</th>
                <th className="p-3">Estado</th>
                <th className="p-3">Inicio</th>
                <th className="p-3 text-right">Inscritos</th>
                <th className="p-3 text-right">Pendientes</th>
                <th className="p-3 text-right">Cuota</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((t) => (
                <tr key={t.id} className="border-b border-line/60 last:border-0 hover:bg-surface-2">
                  <td className="p-3">
                    <Link href={`/dashboard/torneos/${t.id}`} className="font-semibold hover:text-neon">
                      {t.name}
                    </Link>
                    <p className="text-xs text-muted">{t.game?.name ?? t.sport?.name}</p>
                  </td>
                  <td className="p-3">
                    <StatusBadge status={t.status as TournamentStatus} />
                  </td>
                  <td className="p-3 text-muted">{formatDateTime(t.startsAt)}</td>
                  <td className="p-3 text-right tabular-nums">
                    {t.registeredCount}/{t.maxParticipants}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {t.pendingRegistrations ? <span className="font-bold text-amber">{t.pendingRegistrations}</span> : 0}
                  </td>
                  <td className="p-3 text-right">{formatMoney(t.entryFee, t.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No hay partidas aquí" action={<Link href="/dashboard/torneos/nuevo" className="btn-primary">Crear partida</Link>} />
      )}
      <Pagination page={data.page} totalPages={data.totalPages} hrefFor={(p) => `/dashboard/torneos${qs({ ...sp, page: p })}`} />
    </div>
  );
}
