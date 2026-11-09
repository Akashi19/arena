import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2, Clock, ExternalLink, FlaskConical, XCircle } from 'lucide-react';
import { apiOrNull } from '@/lib/api';
import { requireOrganizer } from '@/lib/session';
import { formatAmount, formatDate, PAYMENT_KIND_LABEL, PAYMENT_STATUS_LABEL, PERIOD_LABEL, PROVIDER_LABEL } from '@/lib/format';
import type { SubscriptionPayment } from '@/lib/types';
import { SandboxPayment } from '../../manage';
import { AutoRefresh } from './auto-refresh';

export const metadata: Metadata = { title: 'Pago de suscripción' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PaymentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ estado?: string }> }) {
  const { id } = await params;
  const { estado } = await searchParams;
  await requireOrganizer(`/dashboard/suscripcion/pago/${id}`);
  if (!UUID.test(id)) notFound();
  const p = await apiOrNull<SubscriptionPayment>(`/me/subscription/payments/${id}`);
  if (!p) notFound();
  // De vuelta del proveedor: la confirmación llega por webhook unos segundos después
  const waiting = p.status === 'PENDING' && p.provider !== 'SANDBOX' && (estado === 'ok' || estado === 'pendiente');

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <p className="text-sm text-muted">
        <Link href="/dashboard/suscripcion" className="hover:text-ink">
          Mi suscripción
        </Link>{' '}
        / Pago
      </p>
      <section className="card space-y-5 p-6">
        <div className="flex items-start gap-3">
          <StatusIcon status={p.status} />
          <div>
            <h1 className="text-2xl font-bold uppercase">
              {p.status === 'SUCCEEDED' ? 'Pago confirmado' : p.status === 'PENDING' ? (waiting ? 'Confirmando tu pago…' : 'Pago pendiente') : PAYMENT_STATUS_LABEL[p.status]}
            </h1>
            <p className="text-sm text-muted">
              {p.status === 'SUCCEEDED' && `Tu plan ${p.plan.name} está activo${p.periodEnd ? ` hasta el ${formatDate(p.periodEnd)}` : ''}.`}
              {p.status === 'PENDING' && !waiting && 'Completa el pago para activar el plan.'}
              {waiting && 'El proveedor nos avisará en unos segundos; esta página se actualiza sola.'}
              {(p.status === 'FAILED' || p.status === 'CANCELLED') && (p.failureReason ?? 'No se realizó ningún cobro.')}
              {estado === 'cancelado' && p.status === 'PENDING' && ' Volviste sin completar el pago.'}
            </p>
          </div>
        </div>

        <dl className="space-y-1.5 text-sm">
          <Row k="Plan" v={`${p.plan.name} · ${PERIOD_LABEL[p.billingPeriod].toLowerCase()}`} />
          <Row k="Concepto" v={PAYMENT_KIND_LABEL[p.kind]} />
          <Row k="Precio" v={formatAmount(p.listAmount, p.currency)} />
          {Number(p.discountAmount) > 0 && <Row k={`Descuento${p.promoCode ? ` (${p.promoCode.code})` : ''}`} v={`− ${formatAmount(p.discountAmount, p.currency)}`} />}
          {Number(p.creditAmount) > 0 && <Row k="Saldo del plan anterior" v={`− ${formatAmount(p.creditAmount, p.currency)}`} />}
          <div className="flex justify-between border-t border-line pt-1.5 font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatAmount(p.amount, p.currency)}</dd>
          </div>
          <Row k="Medio de pago" v={PROVIDER_LABEL[p.provider] ?? p.provider} />
        </dl>

        {p.status === 'PENDING' && p.provider === 'SANDBOX' && p.sandboxAvailable && (
          <div className="space-y-3 rounded-xl border border-amber/40 bg-amber/5 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber">
              <FlaskConical className="size-4" aria-hidden /> Entorno de pruebas
            </p>
            <p className="text-sm text-muted">No se cobra dinero real. El resultado se procesa igual que la confirmación de Stripe o Mercado Pago.</p>
            <SandboxPayment paymentId={p.id} />
          </div>
        )}
        {p.status === 'PENDING' && p.provider !== 'SANDBOX' && p.checkoutUrl && !waiting && (
          <a href={p.checkoutUrl} className="btn-primary" rel="noopener noreferrer">
            <ExternalLink className="size-4" /> Pagar con {PROVIDER_LABEL[p.provider]}
          </a>
        )}
        {waiting && <AutoRefresh />}

        <div className="flex flex-wrap gap-2">
          {p.invoice && (
            <Link href={`/dashboard/suscripcion/comprobantes/${p.invoice.id}`} className="btn-ghost">
              Ver comprobante {p.invoice.number}
            </Link>
          )}
          <Link href="/dashboard/suscripcion" className={p.status === 'SUCCEEDED' ? 'btn-primary' : 'btn-ghost'}>
            Volver a mi suscripción
          </Link>
        </div>
      </section>
    </div>
  );
}

function StatusIcon({ status }: { status: SubscriptionPayment['status'] }) {
  if (status === 'SUCCEEDED') return <CheckCircle2 className="mt-1 size-8 shrink-0 text-lime" aria-hidden />;
  if (status === 'PENDING') return <Clock className="mt-1 size-8 shrink-0 text-neon" aria-hidden />;
  return <XCircle className="mt-1 size-8 shrink-0 text-danger" aria-hidden />;
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right tabular-nums">{v}</dd>
    </div>
  );
}
