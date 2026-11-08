import type { Metadata } from 'next';
import Link from 'next/link';
import { api, qs } from '@/lib/api';
import type { Paginated, VerificationStatus } from '@/lib/types';
import { flag, formatDate, ORGANIZER_TYPE_LABEL, VERIFICATION_LABEL } from '@/lib/format';
import { Avatar, EmptyState, Pagination } from '@/components/ui';
import { MaintenanceButton } from '../admin-forms';

export const metadata: Metadata = { title: 'Verificaciones' };

interface Row {
  id: string;
  status: VerificationStatus;
  verificationType: string;
  organizerName: string;
  country: string;
  city: string;
  submittedAt: string;
  reviewedAt: string | null;
  expiresAt: string | null;
  infoRequested: string | null;
  isOpen: boolean;
  organizer: { id: string; displayName: string; logoUrl: string | null; user: { username: string } };
  _count: { documents: number };
}

const STATUSES: VerificationStatus[] = ['PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED', 'EXPIRED'];

export default async function AdminVerificationsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string }> }) {
  const sp = await searchParams;
  const data = await api<Paginated<Row> & { counts: Record<string, number> }>('/admin/verifications', {
    query: { status: sp.status, q: sp.q, page: sp.page, pageSize: 20 },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1.5">
          <Link href="/admin/verificaciones" className={`chip px-3 py-1.5 ${!sp.status ? 'border-neon text-neon' : ''}`}>
            Todas
          </Link>
          {STATUSES.map((s) => (
            <Link key={s} href={`/admin/verificaciones${qs({ status: s, q: sp.q })}`} className={`chip px-3 py-1.5 ${sp.status === s ? 'border-neon text-neon' : ''}`}>
              {VERIFICATION_LABEL[s]} ({data.counts[s] ?? 0})
            </Link>
          ))}
        </nav>
        <form className="flex gap-2">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          <input name="q" defaultValue={sp.q} placeholder="Buscar por nombre" className="input w-56" />
          <button className="btn-ghost">Buscar</button>
        </form>
      </div>
      <MaintenanceButton />

      {data.items.length ? (
        <ul className="space-y-2">
          {data.items.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/verificaciones/${r.id}`} className="card flex flex-wrap items-center gap-3 p-3 transition hover:border-neon/50">
                <Avatar src={r.organizer.logoUrl} name={r.organizerName} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {r.organizerName} <span className="text-xs font-normal text-muted">@{r.organizer.user.username}</span>
                  </p>
                  <p className="truncate text-xs text-muted">
                    {ORGANIZER_TYPE_LABEL[r.verificationType]} · {flag(r.country)} {r.city} · enviada {formatDate(r.submittedAt)} · {r._count.documents} documentos
                    {r.expiresAt && ` · vence ${formatDate(r.expiresAt)}`}
                  </p>
                </div>
                {r.infoRequested && <span className="chip border-amber/40 text-amber">Esperando información</span>}
                <span className="chip">{VERIFICATION_LABEL[r.status]}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No hay solicitudes con ese filtro" />
      )}
      <Pagination page={data.page} totalPages={data.totalPages} hrefFor={(p) => `/admin/verificaciones${qs({ status: sp.status, q: sp.q, page: p })}`} />
    </div>
  );
}
