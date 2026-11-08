import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { api, qs } from '@/lib/api';
import type { ModerationStatus, Paginated } from '@/lib/types';
import { formatDate, formatDateTime, MODERATION_LABEL } from '@/lib/format';
import { EmptyState, Pagination } from '@/components/ui';
import { Stars } from '@/components/trust';
import { ModerationForm } from '../admin-forms';

export const metadata: Metadata = { title: 'Valoraciones' };

interface AdminRating {
  id: string;
  finalScore: string;
  comment: string | null;
  createdAt: string;
  moderationStatus: ModerationStatus;
  isSuspicious: boolean;
  tournament: { name: string; slug: string };
  participant: { username: string; createdAt: string; player: { nickname: string } | null };
  organizer: { displayName: string; user: { username: string } };
  reports: { reason: string; createdAt: string; resolved: boolean }[];
  history: { previousValues: Record<string, unknown>; newValues: Record<string, unknown>; reason: string | null; createdAt: string; changer: { username: string } }[];
}

const FILTERS: Record<string, { label: string; query: Record<string, string> }> = {
  sospechosas: { label: 'Sospechosas', query: { suspicious: 'true' } },
  pendientes: { label: 'Pendientes', query: { status: 'PENDING' } },
  ocultas: { label: 'Ocultas', query: { status: 'HIDDEN' } },
  suspendidas: { label: 'Suspendidas', query: { status: 'SUSPENDED' } },
  todas: { label: 'Todas', query: {} },
};

export default async function AdminRatingsPage({ searchParams }: { searchParams: Promise<{ filtro?: string; page?: string }> }) {
  const sp = await searchParams;
  const filter = sp.filtro && FILTERS[sp.filtro] ? sp.filtro : 'sospechosas';
  const data = await api<Paginated<AdminRating>>('/admin/ratings', { query: { ...FILTERS[filter].query, page: sp.page, pageSize: 20 } });

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1.5">
        {Object.entries(FILTERS).map(([k, f]) => (
          <Link key={k} href={`/admin/valoraciones?filtro=${k}`} className={`chip px-3 py-1.5 ${filter === k ? 'border-neon text-neon' : ''}`}>
            {f.label}
          </Link>
        ))}
      </nav>
      <p className="text-xs text-muted">
        La moderación cambia la visibilidad de una valoración, nunca sus puntuaciones. Toda decisión exige justificación y queda en la
        auditoría; la reputación se recalcula al instante.
      </p>

      {data.items.length ? (
        <ul className="space-y-3">
          {data.items.map((r) => (
            <li key={r.id} className={`card space-y-3 p-4 ${r.isSuspicious ? 'border-danger/40' : ''}`}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <b>{r.participant.player?.nickname ?? r.participant.username}</b>{' '}
                    <span className="text-xs text-muted">
                      (@{r.participant.username}, cuenta del {formatDate(r.participant.createdAt)}) → {r.organizer.displayName} ·{' '}
                      <Link href={`/torneos/${r.tournament.slug}`} className="hover:text-ink">
                        {r.tournament.name}
                      </Link>
                    </span>
                  </p>
                  <p className="text-xs text-muted">{formatDateTime(r.createdAt)}</p>
                </div>
                <Stars value={Number(r.finalScore)} size={14} />
                <span className="font-display font-bold">{Number(r.finalScore).toFixed(2)}</span>
                <span className="chip">{MODERATION_LABEL[r.moderationStatus]}</span>
                {r.isSuspicious && (
                  <span className="chip border-danger/40 text-danger">
                    <AlertTriangle className="size-3.5" /> Sospechosa
                  </span>
                )}
              </div>
              {r.comment && <p className="rounded-lg bg-surface-2 p-3 text-sm">{r.comment}</p>}
              {r.reports.length > 0 && (
                <div className="text-xs">
                  <p className="font-semibold text-danger">Reportes ({r.reports.length})</p>
                  <ul className="mt-1 space-y-0.5 text-muted">
                    {r.reports.map((rep, i) => (
                      <li key={i}>
                        {formatDate(rep.createdAt)} · {rep.reason} {rep.resolved && '(resuelto)'}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {r.history.length > 0 && (
                <details className="text-xs text-muted">
                  <summary className="cursor-pointer">Historial de modificaciones ({r.history.length})</summary>
                  <ul className="mt-1 space-y-1">
                    {r.history.map((h, i) => (
                      <li key={i}>
                        {formatDateTime(h.createdAt)} · @{h.changer.username} · {h.reason}: {JSON.stringify(h.previousValues)} → {JSON.stringify(h.newValues)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <ModerationForm id={r.id} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Nada pendiente con este filtro" />
      )}
      <Pagination page={data.page} totalPages={data.totalPages} hrefFor={(p) => `/admin/valoraciones${qs({ filtro: filter, page: p })}`} />
    </div>
  );
}
