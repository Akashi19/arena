import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { apiOrNull } from '@/lib/api';
import { requireOrganizer } from '@/lib/session';
import { formatAmount, formatDate, PAYMENT_KIND_LABEL, PERIOD_LABEL, PROVIDER_LABEL } from '@/lib/format';
import type { SubscriptionInvoice } from '@/lib/types';
import { PrintButton } from './print-button';

export const metadata: Metadata = { title: 'Comprobante' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Comprobante de pago de la suscripción (no es una factura fiscal; la emite el proveedor si corresponde). */
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireOrganizer(`/dashboard/suscripcion/comprobantes/${id}`);
  if (!UUID.test(id)) notFound();
  const inv = await apiOrNull<SubscriptionInvoice>(`/me/subscription/invoices/${id}`);
  if (!inv) notFound();
  const p = inv.payment;
  const o = inv.subscription.organizer;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/dashboard/suscripcion/historial" className="mr-auto text-sm text-muted hover:text-ink">
          ← Historial de pagos
        </Link>
        <PrintButton />
        {inv.providerUrl && (
          <a href={inv.providerUrl} className="btn-ghost px-3 py-1.5 text-sm" rel="noopener noreferrer" target="_blank">
            Factura del proveedor
          </a>
        )}
      </div>
      <article className="card space-y-6 p-6 md:p-8 print:border-0 print:bg-white print:text-black print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-display text-2xl font-bold">ARENA</p>
            <p className="text-xs text-muted print:text-black/60">Plataforma de torneos · suscripción de organizador</p>
          </div>
          <div className="text-right">
            <h1 className="text-lg font-bold uppercase">Comprobante de pago</h1>
            <p className="font-mono text-sm">{inv.number}</p>
            <p className="text-xs text-muted print:text-black/60">Emitido el {formatDate(inv.issuedAt)}</p>
          </div>
        </header>
        <section className="text-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted print:text-black/60">Cliente</p>
          <p className="font-semibold">{o.displayName}</p>
          <p>{o.user.email}</p>
          {(o.city || o.country) && <p>{[o.city, o.country].filter(Boolean).join(', ')}</p>}
        </section>
        {p && (
          <table className="w-full text-sm">
            <caption className="sr-only">Detalle del comprobante</caption>
            <thead className="text-left text-[11px] uppercase tracking-wider text-muted print:text-black/60">
              <tr>
                <th scope="col" className="py-2 font-semibold">Descripción</th>
                <th scope="col" className="py-2 text-right font-semibold">Importe</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-line">
                <td className="py-2">
                  Plan {p.plan.name} · {PERIOD_LABEL[p.billingPeriod].toLowerCase()} ({PAYMENT_KIND_LABEL[p.kind].toLowerCase()})
                  {p.periodStart && p.periodEnd && <span className="block text-xs text-muted print:text-black/60">Periodo {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}</span>}
                </td>
                <td className="py-2 text-right tabular-nums">{formatAmount(p.listAmount, p.currency)}</td>
              </tr>
              {Number(p.discountAmount) > 0 && (
                <tr>
                  <td className="py-1">Descuento{p.promoCode ? ` (${p.promoCode.code})` : ''}</td>
                  <td className="py-1 text-right tabular-nums">− {formatAmount(p.discountAmount, p.currency)}</td>
                </tr>
              )}
              {Number(p.creditAmount) > 0 && (
                <tr>
                  <td className="py-1">Saldo no usado del plan anterior</td>
                  <td className="py-1 text-right tabular-nums">− {formatAmount(p.creditAmount, p.currency)}</td>
                </tr>
              )}
              <tr className="border-t border-line font-bold">
                <td className="py-2">Total pagado</td>
                <td className="py-2 text-right tabular-nums">{formatAmount(inv.amount, inv.currency)}</td>
              </tr>
            </tbody>
          </table>
        )}
        <footer className="space-y-1 text-xs text-muted print:text-black/60">
          {p?.paidAt && <p>Pagado el {formatDate(p.paidAt)} mediante {PROVIDER_LABEL[p.provider] ?? p.provider}.</p>}
          <p>Comprobante interno de Arena. Si tu país requiere factura fiscal, la emite el proveedor de pago.</p>
        </footer>
      </article>
    </div>
  );
}
