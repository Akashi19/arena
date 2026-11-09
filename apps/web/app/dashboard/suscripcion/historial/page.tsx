import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';
import { requireOrganizer } from '@/lib/session';
import { formatAmount, formatDate, formatDateTime, PAYMENT_KIND_LABEL, PAYMENT_STATUS_LABEL, PERIOD_LABEL, PROVIDER_LABEL, SUBSCRIPTION_STATUS_LABEL } from '@/lib/format';
import type { SubscriptionHistoryEntry, SubscriptionPayment } from '@/lib/types';

export const metadata: Metadata = { title: 'Historial de pagos' };

const STATUS_TONE: Record<string, string> = {
  SUCCEEDED: 'border-lime/40 text-lime',
  PENDING: 'border-neon/40 text-neon',
  FAILED: 'border-danger/40 text-danger',
  CANCELLED: 'text-muted',
  REFUNDED: 'border-amber/40 text-amber',
};

export default async function BillingHistoryPage() {
  await requireOrganizer('/dashboard/suscripcion/historial');
  const [payments, history] = await Promise.all([
    api<SubscriptionPayment[]>('/me/subscription/payments'),
    api<SubscriptionHistoryEntry[]>('/me/subscription/history'),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">
          <Link href="/dashboard/suscripcion" className="hover:text-ink">
            Mi suscripción
          </Link>{' '}
          / Historial
        </p>
        <h1 className="section-title">Pagos y cambios de plan</h1>
      </div>

      <section className="card min-w-0 p-5" aria-labelledby="payments-title">
        <h2 id="payments-title" className="mb-3 text-lg font-bold uppercase">
          Pagos
        </h2>
        {payments.length ? (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Pagos de tu suscripción</caption>
              <thead className="text-left text-[11px] uppercase tracking-wider text-muted">
                <tr>
                  <th scope="col" className="py-2 font-semibold">Fecha</th>
                  <th scope="col" className="py-2 font-semibold">Concepto</th>
                  <th scope="col" className="py-2 font-semibold">Medio</th>
                  <th scope="col" className="py-2 text-right font-semibold">Importe</th>
                  <th scope="col" className="py-2 pl-3 font-semibold">Estado</th>
                  <th scope="col" className="py-2 font-semibold"><span className="sr-only">Comprobante</span></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t border-line align-top">
                    <td className="py-2.5 pr-3 text-muted">{formatDate(p.paidAt ?? p.createdAt)}</td>
                    <td className="py-2.5 pr-3">
                      <Link href={`/dashboard/suscripcion/pago/${p.id}`} className="font-semibold hover:text-neon">
                        {p.plan.name} {PERIOD_LABEL[p.billingPeriod].toLowerCase()}
                      </Link>
                      <span className="block text-xs text-muted">
                        {PAYMENT_KIND_LABEL[p.kind]}
                        {p.periodStart && p.periodEnd && ` · ${formatDate(p.periodStart)} – ${formatDate(p.periodEnd)}`}
                        {p.promoCode && ` · ${p.promoCode.code}`}
                      </span>
                      {p.failureReason && p.status !== 'SUCCEEDED' && <span className="block text-xs text-muted">{p.failureReason}</span>}
                    </td>
                    <td className="py-2.5 pr-3 text-muted">{PROVIDER_LABEL[p.provider] ?? p.provider}</td>
                    <td className="py-2.5 text-right font-semibold tabular-nums">{formatAmount(p.amount, p.currency)}</td>
                    <td className="py-2.5 pl-3">
                      <span className={`chip text-[11px] ${STATUS_TONE[p.status] ?? ''}`}>{PAYMENT_STATUS_LABEL[p.status]}</span>
                    </td>
                    <td className="py-2.5 text-right">
                      {p.invoice && (
                        <Link href={`/dashboard/suscripcion/comprobantes/${p.invoice.id}`} className="text-xs font-semibold text-neon hover:underline">
                          {p.invoice.number}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">Todavía no hiciste pagos. El plan Free no genera cobros.</p>
        )}
      </section>

      <section className="card p-5" aria-labelledby="history-title">
        <h2 id="history-title" className="mb-3 text-lg font-bold uppercase">
          Historial de la suscripción
        </h2>
        <ol className="divide-y divide-line text-sm">
          {history.map((h) => (
            <li key={h.id} className="grid gap-1 py-2.5 md:grid-cols-[170px_1fr_auto] md:gap-4">
              <span className="text-xs text-muted">{formatDateTime(h.createdAt)}</span>
              <div className="min-w-0">
                <p>{h.reason ?? 'Cambio de suscripción'}</p>
                <p className="text-xs text-muted">
                  {h.fromPlan && h.toPlan && h.fromPlan.code !== h.toPlan.code ? `${h.fromPlan.name} → ${h.toPlan.name} · ` : h.toPlan ? `${h.toPlan.name} · ` : ''}
                  {h.fromStatus && h.fromStatus !== h.toStatus ? `${SUBSCRIPTION_STATUS_LABEL[h.fromStatus]} → ` : ''}
                  {SUBSCRIPTION_STATUS_LABEL[h.toStatus]}
                </p>
              </div>
              <span className="text-xs text-muted">{h.changedBy ? `@${h.changedBy.username}` : 'Sistema'}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
