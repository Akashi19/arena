import type { Metadata } from 'next';
import Link from 'next/link';
import { api, qs } from '@/lib/api';
import type { RegistrationPaymentList } from '@/lib/types';
import { formatAmount, formatDateTime, REGISTRATION_PAYMENT_STATUS_LABEL } from '@/lib/format';
import { Pagination } from '@/components/ui';
import { BillingTabs } from '../tabs';

export const metadata: Metadata = { title: 'Inscripciones cobradas' };

const FILTERS = ['', 'SUCCEEDED', 'PENDING', 'REFUNDED', 'CANCELLED', 'FAILED'];

export default async function AdminRegistrationPaymentsPage({ searchParams }: { searchParams: Promise<{ estado?: string; q?: string; page?: string }> }) {
  const sp = await searchParams;
  const status = FILTERS.includes(sp.estado ?? '') ? sp.estado : '';
  const data = await api<RegistrationPaymentList>(`/admin/registration-payments${qs({ status, q: sp.q, page: sp.page, pageSize: 20 })}`);

  return (
    <div className="space-y-5">
      <BillingTabs />
      <p className="text-sm text-muted">
        Inscripciones que los organizadores cobran con su propia cuenta de Mercado Pago. Arena solo retiene su comisión (configurable por plan en
        «Planes»).
      </p>
      {data.totals.length > 0 && (
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.totals.map((t) => (
            <div key={t.currency} className="card p-4">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">Comisión de Arena · {t.currency}</dt>
              <dd className="font-display text-3xl font-bold tabular-nums">{formatAmount(t.fee, t.currency)}</dd>
              <dd className="text-xs text-muted">
                {t.payments} pagos · {formatAmount(t.gross, t.currency)} cobrados por los organizadores
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <nav className="flex flex-wrap gap-1.5" aria-label="Estado del pago">
          {FILTERS.map((f) => (
            <Link
              key={f || 'all'}
              href={`/admin/suscripciones/inscripciones${qs({ estado: f || undefined, q: sp.q })}`}
              aria-current={status === f ? 'page' : undefined}
              className={`chip text-xs ${status === f ? 'border-neon text-neon' : 'hover:text-ink'}`}
            >
              {f ? REGISTRATION_PAYMENT_STATUS_LABEL[f] : 'Todos'}
            </Link>
          ))}
        </nav>
        <form className="flex gap-2" role="search">
          {status && <input type="hidden" name="estado" value={status} />}
          <input name="q" defaultValue={sp.q} placeholder="Partida, jugador u organizador" className="input w-60" aria-label="Buscar" />
          <button className="btn-primary px-3 py-2 text-sm">Buscar</button>
        </form>
      </div>
      <div className="card relative overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <caption className="sr-only">Pagos de inscripción de toda la plataforma</caption>
          <thead className="text-left text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Fecha</th>
              <th scope="col" className="py-3 font-semibold">Organizador</th>
              <th scope="col" className="py-3 font-semibold">Partida y jugador</th>
              <th scope="col" className="py-3 text-right font-semibold">Importe</th>
              <th scope="col" className="py-3 text-right font-semibold">Comisión</th>
              <th scope="col" className="px-4 py-3 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((p) => (
              <tr key={p.id} className="border-t border-line align-top">
                <td className="px-4 py-2.5 text-muted">{formatDateTime(p.paidAt ?? p.createdAt)}</td>
                <td className="py-2.5 pr-3 font-semibold">{p.organizer?.displayName}</td>
                <td className="py-2.5 pr-3">
                  <Link href={`/torneos/${p.tournament.slug}`} className="hover:text-neon">
                    {p.tournament.name}
                  </Link>
                  <span className="block text-xs text-muted">
                    {p.participant} · @{p.payer.username}
                    {p.provider === 'SANDBOX' && ' · prueba'}
                  </span>
                </td>
                <td className="py-2.5 text-right tabular-nums">{formatAmount(p.amount, p.currency)}</td>
                <td className="py-2.5 text-right font-semibold tabular-nums">{formatAmount(p.platformFee, p.currency)}</td>
                <td className="px-4 py-2.5">
                  {REGISTRATION_PAYMENT_STATUS_LABEL[p.status]}
                  {p.refundReason && <span className="block text-xs text-muted">{p.refundReason}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.items.length && <p className="p-4 text-sm text-muted">No hay pagos con estos filtros.</p>}
      </div>
      <Pagination page={data.page} totalPages={data.totalPages} hrefFor={(n) => `/admin/suscripciones/inscripciones${qs({ estado: status, q: sp.q, page: n })}`} />
    </div>
  );
}
