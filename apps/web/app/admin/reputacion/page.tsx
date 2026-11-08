import type { Metadata } from 'next';
import Link from 'next/link';
import { api, qs } from '@/lib/api';
import type { Paginated, Reputation, ReputationLevel, VerificationStatus } from '@/lib/types';
import { formatDate, REPUTATION_LABEL, VERIFICATION_LABEL } from '@/lib/format';
import { Avatar, Pagination } from '@/components/ui';
import { CancellationForm } from '../admin-forms';

export const metadata: Metadata = { title: 'Reputación' };

interface OrgRow {
  id: string;
  displayName: string;
  logoUrl: string | null;
  verificationStatus: VerificationStatus;
  user: { username: string };
  reputation: Reputation | null;
  _count: { incidents: number; ratings: number };
}

interface Cancellation {
  id: string;
  name: string;
  slug: string;
  startsAt: string;
  updatedAt: string;
  cancelledReason: string | null;
  cancellationJustified: boolean | null;
  organizer: { displayName: string; user: { username: string } };
  _count: { registrations: number };
}

const LEVELS: ReputationLevel[] = ['NEW', 'INITIAL', 'GOOD', 'EXCELLENT', 'TOP'];

export default async function AdminReputationPage({ searchParams }: { searchParams: Promise<{ q?: string; level?: string; page?: string }> }) {
  const sp = await searchParams;
  const level = LEVELS.includes(sp.level as ReputationLevel) ? sp.level : undefined;
  const [orgs, cancellations] = await Promise.all([
    api<Paginated<OrgRow>>('/admin/reputation', { query: { q: sp.q, level, page: sp.page, pageSize: 25 } }),
    api<Paginated<Cancellation>>('/admin/cancellations', { query: { pageSize: 10 } }),
  ]);
  const pendingCancellations = cancellations.items.filter((c) => c.cancellationJustified === null);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <form className="flex flex-wrap gap-2">
          <input name="q" defaultValue={sp.q} placeholder="Buscar organizador" className="input w-56" />
          <select name="level" defaultValue={level ?? ''} className="input w-48">
            <option value="">Todos los niveles</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {REPUTATION_LABEL[l]}
              </option>
            ))}
          </select>
          <button className="btn-ghost">Filtrar</button>
        </form>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-surface-3 text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Organizador</th>
                <th className="px-2 py-2 text-left">Verificación</th>
                <th className="px-2 py-2 text-center">Puntuación</th>
                <th className="px-2 py-2 text-left">Nivel</th>
                <th className="px-2 py-2 text-center">Cumplimiento</th>
                <th className="px-2 py-2 text-center">Inc. confirmadas</th>
                <th className="px-2 py-2 text-center">Por revisar</th>
              </tr>
            </thead>
            <tbody>
              {orgs.items.map((o) => (
                <tr key={o.id} className="border-t border-line">
                  <td className="px-3 py-2">
                    <Link href={`/organizer/${o.user.username}/trust`} className="flex items-center gap-2 font-semibold hover:text-neon">
                      <Avatar src={o.logoUrl} name={o.displayName} size={26} /> <span className="truncate">{o.displayName}</span>
                    </Link>
                  </td>
                  <td className="px-2 py-2">{VERIFICATION_LABEL[o.verificationStatus]}</td>
                  <td className="px-2 py-2 text-center tabular-nums">
                    {o.reputation?.totalRatings ? `${Number(o.reputation.averageScore).toFixed(2)} (${o.reputation.totalRatings})` : '—'}
                  </td>
                  <td className="px-2 py-2">{REPUTATION_LABEL[o.reputation?.reputationLevel ?? 'NEW']}</td>
                  <td className="px-2 py-2 text-center tabular-nums">{o.reputation?.dueTournaments ? `${Number(o.reputation.completionRate).toFixed(0)}%` : '—'}</td>
                  <td className="px-2 py-2 text-center tabular-nums">{o.reputation?.confirmedIncidents ?? 0}</td>
                  <td className="px-2 py-2 text-center text-xs">
                    {o._count.incidents > 0 && <span className="text-amber">{o._count.incidents} inc. </span>}
                    {o._count.ratings > 0 && <span className="text-danger">{o._count.ratings} val.</span>}
                    {!o._count.incidents && !o._count.ratings && <span className="text-muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={orgs.page} totalPages={orgs.totalPages} hrefFor={(p) => `/admin/reputacion${qs({ q: sp.q, level, page: p })}`} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold uppercase">Cancelaciones por revisar ({pendingCancellations.length})</h2>
        <p className="text-xs text-muted">
          Las cancelaciones con participantes aprobados restan cumplimiento salvo que se marquen como justificadas (por ejemplo, fuerza
          mayor acreditada).
        </p>
        {cancellations.items.length ? (
          <ul className="space-y-2">
            {cancellations.items.map((c) => (
              <li key={c.id} className="card space-y-2 p-4">
                <p className="text-sm">
                  <Link href={`/torneos/${c.slug}`} className="font-semibold hover:text-neon">
                    {c.name}
                  </Link>{' '}
                  <span className="text-xs text-muted">
                    · {c.organizer.displayName} · {c._count.registrations} participantes · cancelada {formatDate(c.updatedAt)}
                  </span>
                </p>
                {c.cancelledReason && <p className="text-sm text-muted">Motivo del organizador: {c.cancelledReason}</p>}
                {c.cancellationJustified === null ? (
                  <CancellationForm id={c.id} />
                ) : (
                  <p className="text-xs">{c.cancellationJustified ? 'Revisada: justificada (no computa)' : 'Revisada: injustificada (computa)'}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="card p-5 text-sm text-muted">No hay cancelaciones con participantes.</p>
        )}
      </section>
    </div>
  );
}
