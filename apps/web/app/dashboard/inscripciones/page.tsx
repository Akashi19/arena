import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';
import { requireMe } from '@/lib/session';
import type { RegistrationStatus, TournamentCard } from '@/lib/types';
import { formatDateTime, formatMoney } from '@/lib/format';
import { EmptyState, OrganizerTag, StatusBadge } from '@/components/ui';

export const metadata: Metadata = { title: 'Mis inscripciones' };

const LABEL: Record<RegistrationStatus, [string, string]> = {
  PENDING: ['Pendiente', 'text-amber'],
  PAYMENT_PENDING: ['Pago pendiente', 'text-amber'],
  APPROVED: ['Aprobada', 'text-lime'],
  REJECTED: ['Rechazada', 'text-danger'],
  WITHDRAWN: ['Retirada', 'text-muted'],
};

export default async function MyRegistrationsPage() {
  await requireMe('/dashboard/inscripciones');
  const regs = await api<{ id: string; status: RegistrationStatus; team: { name: string } | null; payments: { id: string }[]; tournament: TournamentCard }[]>('/me/registrations');
  return (
    <div className="space-y-5">
      <h1 className="section-title">Mis inscripciones</h1>
      {regs.length ? (
        <ul className="space-y-2">
          {regs.map((r) => (
            <li key={r.id} className="card flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <StatusBadge status={r.tournament.status} />
                  <span className="text-xs text-muted">{r.tournament.game?.name ?? r.tournament.sport?.name}</span>
                </div>
                <Link href={`/torneos/${r.tournament.slug}`} className="font-semibold hover:text-neon">
                  {r.tournament.name}
                </Link>
                <p className="text-xs text-muted">
                  {formatDateTime(r.tournament.startsAt)} · {formatMoney(r.tournament.entryFee, r.tournament.currency)}
                  {r.team && ` · con ${r.team.name}`}
                </p>
              </div>
              <OrganizerTag organizer={r.tournament.organizer} />
              <span className={`text-sm font-semibold ${LABEL[r.status][1]}`}>{LABEL[r.status][0]}</span>
              {r.status === 'PAYMENT_PENDING' && r.payments[0] && (
                <Link href={`/inscripciones/pago/${r.payments[0].id}`} className="btn-primary px-3 py-1.5 text-sm">
                  Completar pago
                </Link>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No tienes inscripciones" action={<Link href="/torneos" className="btn-primary">Buscar torneos</Link>} />
      )}
    </div>
  );
}
