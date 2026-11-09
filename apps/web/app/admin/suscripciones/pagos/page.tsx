import type { Metadata } from 'next';
import Link from 'next/link';
import { api, qs } from '@/lib/api';
import type { AdminPayment, Paginated } from '@/lib/types';
import { formatAmount, formatDateTime, PAYMENT_KIND_LABEL, PAYMENT_STATUS_LABEL, PERIOD_LABEL, PROVIDER_LABEL } from '@/lib/format';
import { Pagination } from '@/components/ui';
import { BillingTabs } from '../tabs';

export const metadata: Metadata = { title: 'Pagos de suscripción' };

export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const sp = await searchParams;
  const status = sp.status ?? 'PENDING';
  const data = await api<Paginated<AdminPayment>>(`/admin/billing/payments${qs({ status: status === 'ALL' ? undefined : status, page: sp.page, pageSize: 20 })}`);

  return (
    <div className="space-y-5">
      <BillingTabs />
      <nav className="flex flex-wrap gap-2" aria-label="Estado del pago">
        {['PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'ALL'].map((s) => (
          <Link
            key={s}
            href={`/admin/suscripciones/pagos?status=${s}`}
            aria-current={status === s ? 'page' : undefined}
            className={`chip ${status === s ? 'border-neon text-neon' : 'hover:text-ink'}`}
          >
            {s === 'ALL' ? 'Todos' : PAYMENT_STATUS_LABEL[s]}
          </Link>
        ))}
      </nav>
      <div className="card relative overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <caption className="sr-only">Pagos de suscripción</caption>
          <thead className="text-left text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Fecha</th>
              <th scope="col" className="py-3 font-semibold">Organizador</th>
              <th scope="col" className="py-3 font-semibold">Concepto</th>
              <th scope="col" className="py-3 font-semibold">Medio</th>
              <th scope="col" className="py-3 text-right font-semibold">Importe</th>
              <th scope="col" className="px-4 py-3 font-semibold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((p) => (
              <tr key={p.id} className="border-t border-line align-top">
                <td className="px-4 py-2.5 text-muted">{formatDateTime(p.paidAt ?? p.createdAt)}</td>
                <td className="py-2.5 pr-3">
                  <Link href={`/organizer/${p.subscription.organizer.user.username}`} className="font-semibold hover:text-neon">
                    {p.subscription.organizer.displayName}
                  </Link>
                </td>
                <td className="py-2.5 pr-3">
                  {p.plan.name} {PERIOD_LABEL[p.billingPeriod].toLowerCase()}
                  <span className="block text-xs text-muted">
                    {PAYMENT_KIND_LABEL[p.kind]}
                    {p.promoCode && ` · ${p.promoCode.code}`}
                    {p.invoice && ` · ${p.invoice.number}`}
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-muted">{PROVIDER_LABEL[p.provider] ?? p.provider}</td>
                <td className="py-2.5 text-right font-semibold tabular-nums">{formatAmount(p.amount, p.currency)}</td>
                <td className="px-4 py-2.5">
                  {PAYMENT_STATUS_LABEL[p.status]}
                  {p.failureReason && p.status !== 'SUCCEEDED' && <span className="block text-xs text-muted">{p.failureReason}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.items.length && <p className="p-4 text-sm text-muted">No hay pagos en este estado.</p>}
      </div>
      <Pagination page={data.page} totalPages={data.totalPages} hrefFor={(n) => `/admin/suscripciones/pagos${qs({ status, page: n })}`} />
    </div>
  );
}
