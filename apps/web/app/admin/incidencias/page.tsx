import type { Metadata } from 'next';
import Link from 'next/link';
import { api, qs } from '@/lib/api';
import type { IncidentStatus, IncidentType, Paginated } from '@/lib/types';
import { formatDateTime, INCIDENT_STATUS_LABEL, INCIDENT_TYPE_LABEL } from '@/lib/format';
import { EmptyState, Pagination } from '@/components/ui';
import { OpenPrivateFile, ResolveIncidentForm } from '../admin-forms';

export const metadata: Metadata = { title: 'Incidencias' };

interface AdminIncident {
  id: string;
  incidentType: IncidentType;
  description: string;
  status: IncidentStatus;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
  hasEvidence: boolean;
  tournament: { name: string; slug: string };
  organizer: { displayName: string; user: { username: string } };
  reporter: { username: string };
}

const STATUSES: IncidentStatus[] = ['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED'];

export default async function AdminIncidentsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const sp = await searchParams;
  const status = sp.status && STATUSES.includes(sp.status as IncidentStatus) ? sp.status : undefined;
  const data = await api<Paginated<AdminIncident>>('/admin/incidents', { query: { status, page: sp.page, pageSize: 20 } });

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1.5">
        <Link href="/admin/incidencias" className={`chip px-3 py-1.5 ${!status ? 'border-neon text-neon' : ''}`}>
          Todas
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/incidencias?status=${s}`} className={`chip px-3 py-1.5 ${status === s ? 'border-neon text-neon' : ''}`}>
            {INCIDENT_STATUS_LABEL[s]}
          </Link>
        ))}
      </nav>
      <p className="text-xs text-muted">Solo las incidencias confirmadas se publican y cuentan en los indicadores del organizador.</p>

      {data.items.length ? (
        <ul className="space-y-3">
          {data.items.map((i) => (
            <li key={i.id} className="card space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 text-sm">
                  <b>{INCIDENT_TYPE_LABEL[i.incidentType]}</b> · {i.organizer.displayName} ·{' '}
                  <Link href={`/torneos/${i.tournament.slug}`} className="text-muted hover:text-ink">
                    {i.tournament.name}
                  </Link>
                  <span className="block text-xs text-muted">
                    Reporta @{i.reporter.username} · {formatDateTime(i.createdAt)}
                  </span>
                </p>
                <span className="chip">{INCIDENT_STATUS_LABEL[i.status]}</span>
              </div>
              <p className="whitespace-pre-line rounded-lg bg-surface-2 p-3 text-sm">{i.description}</p>
              {i.hasEvidence && <OpenPrivateFile kind="incident" id={i.id} label="Ver evidencia (enlace de 5 min)" />}
              {i.resolution && <p className="text-sm text-muted">Resolución: {i.resolution}</p>}
              {(i.status === 'OPEN' || i.status === 'UNDER_REVIEW') && <ResolveIncidentForm id={i.id} />}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No hay incidencias con ese filtro" />
      )}
      <Pagination page={data.page} totalPages={data.totalPages} hrefFor={(p) => `/admin/incidencias${qs({ status, page: p })}`} />
    </div>
  );
}
