import type { Metadata } from 'next';
import Link from 'next/link';
import { api, qs } from '@/lib/api';
import type { OrganizerPublic, Paginated } from '@/lib/types';
import { COUNTRIES, flag } from '@/lib/format';
import { Avatar, EmptyState, Pagination, ReputationPill } from '@/components/ui';
import { VerifiedBadge } from '@/components/verified-badge';

export const metadata: Metadata = { title: 'Organizadores' };

export default async function OrganizersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const query = { q: sp.q, country: sp.country, verified: sp.verified, page: sp.page };
  const result = await api<Paginated<OrganizerPublic & { _count: { tournaments: number } }>>('/organizers', {
    auth: false,
    query: { ...query, pageSize: 24 },
  });

  return (
    <div>
      <h1 className="section-title">Organizadores</h1>
      <form className="my-6 flex flex-col gap-2 sm:flex-row">
        <input name="q" defaultValue={sp.q} placeholder="Buscar por nombre" className="input sm:max-w-sm" />
        <select name="country" defaultValue={sp.country ?? ''} className="input sm:max-w-48">
          <option value="">Todos los países</option>
          {Object.entries(COUNTRIES).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 px-2 text-sm">
          <input type="checkbox" name="verified" value="true" defaultChecked={sp.verified === 'true'} className="accent-[var(--color-neon)]" /> Solo verificados
        </label>
        <button className="btn-primary">Filtrar</button>
      </form>
      {result.items.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {result.items.map((o) => (
            <Link key={o.id} href={`/organizer/${o.user.username}`} className="card flex gap-4 p-5 transition hover:border-neon/50">
              <Avatar src={o.logoUrl} name={o.displayName} size={64} accent={o.primaryColor} />
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <p className="truncate text-lg font-bold">{o.displayName}</p>
                  <VerifiedBadge organizer={o} />
                </div>
                <p className="text-xs text-muted">
                  {flag(o.country)} {o.city} · {o._count.tournaments} torneos
                </p>
                <ReputationPill reputation={o.reputation} />
                {o.description && <p className="mt-2 line-clamp-2 text-sm text-muted">{o.description}</p>}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState title="No encontramos organizadores" />
      )}
      <Pagination page={result.page} totalPages={result.totalPages} hrefFor={(p) => `/organizadores${qs({ ...query, page: p })}`} />
    </div>
  );
}
