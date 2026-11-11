import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2, Clock, RotateCcw, XCircle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { requireMe } from '@/lib/session';
import { formatAmount, formatDateTime } from '@/lib/format';
import type { RegistrationPaymentView } from '@/lib/types';
import { AutoRefresh } from '@/app/dashboard/suscripcion/pago/[id]/auto-refresh';
import { SandboxButtons } from './sandbox-buttons';

export const metadata: Metadata = { title: 'Pago de inscripción' };

export default async function RegistrationPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ estado?: string }>;
}) {
  const { id } = await params;
  const { estado } = await searchParams;
  await requireMe(`/inscripciones/pago/${id}`);
  let p: RegistrationPaymentView;
  try {
    p = await api<RegistrationPaymentView>(`/registration-payments/${id}`);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403 || e.status === 400)) notFound();
    throw e;
  }
  const expired = p.expired;
  // Volvió de Mercado Pago y el webhook todavía no llegó: se vuelve a consultar sola
  const waiting = p.status === 'PENDING' && !expired && (estado === 'ok' || estado === 'pendiente');

  const view =
    p.status === 'SUCCEEDED'
      ? { icon: CheckCircle2, tone: 'text-lime', title: '¡Pago confirmado!', text: 'Tu inscripción quedó aprobada y tu cupo está asegurado.' }
      : p.status === 'REFUNDED'
        ? { icon: RotateCcw, tone: 'text-muted', title: 'Pago reembolsado', text: p.refundReason ?? 'El importe se devolvió a tu medio de pago.' }
        : p.status === 'CANCELLED' || expired
          ? { icon: XCircle, tone: 'text-danger', title: 'Pago anulado', text: p.failureReason ?? 'La reserva venció antes de completar el pago.' }
          : p.status === 'FAILED'
            ? { icon: XCircle, tone: 'text-danger', title: 'No se pudo iniciar el pago', text: p.failureReason ?? 'Inténtalo de nuevo.' }
            : waiting
              ? { icon: Clock, tone: 'text-amber', title: 'Confirmando tu pago…', text: 'Mercado Pago nos avisará en unos segundos. Puedes quedarte en esta página.' }
              : { icon: Clock, tone: 'text-amber', title: 'Cupo reservado', text: `Completa el pago antes del ${formatDateTime(p.expiresAt)} para asegurar tu inscripción.` };
  const Icon = view.icon;

  return (
    <div className="mx-auto max-w-xl space-y-5 px-4 py-10">
      {waiting && <AutoRefresh />}
      <p className="text-sm text-muted">
        <Link href={`/torneos/${p.tournament.slug}`} className="hover:text-ink">
          {p.tournament.name}
        </Link>{' '}
        / Pago de inscripción
      </p>
      <section className="card space-y-5 p-6" aria-live="polite">
        <div className="flex items-start gap-3">
          <Icon className={`mt-1 size-7 shrink-0 ${view.tone}`} aria-hidden />
          <div>
            <h1 className="text-2xl font-bold">{view.title}</h1>
            <p className="text-sm text-muted">{view.text}</p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 rounded-xl border border-line p-4 text-sm">
          <div>
            <dt className="text-xs text-muted">Importe</dt>
            <dd className="font-display text-2xl font-bold tabular-nums">{formatAmount(p.amount, p.currency)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Participante</dt>
            <dd className="font-semibold">{p.participant ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Medio</dt>
            <dd>{p.provider === 'SANDBOX' ? 'Pago de prueba' : 'Mercado Pago'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{p.paidAt ? 'Pagado el' : 'Reserva hasta'}</dt>
            <dd>{formatDateTime(p.paidAt ?? p.expiresAt)}</dd>
          </div>
        </dl>

        {p.status === 'PENDING' && !expired && p.failureReason && (
          <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            El último intento fue rechazado: {p.failureReason}. Puedes intentarlo otra vez con otro medio de pago.
          </p>
        )}

        {p.status === 'PENDING' && !expired && (p.sandbox ? (
          <SandboxButtons paymentId={p.id} />
        ) : (
          p.checkoutUrl && (
            <a href={p.checkoutUrl} className="btn-primary w-full">
              {p.failureReason ? 'Reintentar el pago en Mercado Pago' : 'Pagar con Mercado Pago'}
            </a>
          )
        ))}

        <div className="flex flex-wrap gap-2 text-sm">
          <Link href={`/torneos/${p.tournament.slug}`} className="btn-ghost">
            Ver la partida
          </Link>
          <Link href="/dashboard/inscripciones" className="btn-ghost">
            Mis inscripciones
          </Link>
        </div>
        <p className="text-xs text-muted">
          El pago lo recibe directamente el organizador. Las devoluciones siguen su política de cancelación; si rechaza tu inscripción, se te
          reembolsa automáticamente.
        </p>
      </section>
    </div>
  );
}
