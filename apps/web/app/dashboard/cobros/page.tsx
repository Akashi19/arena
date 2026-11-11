import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Wallet } from 'lucide-react';
import { api, qs } from '@/lib/api';
import { requireOrganizer } from '@/lib/session';
import { formatAmount, formatDateTime, REGISTRATION_PAYMENT_STATUS_LABEL } from '@/lib/format';
import type { PaymentAccountInfo, RegistrationPaymentList } from '@/lib/types';
import { Pagination } from '@/components/ui';
import { connectMercadoPagoAction } from '@/app/actions';
import { DisconnectForm, RefundForm, SandboxConnectForm } from './forms';

export const metadata: Metadata = { title: 'Cobros' };

const STATUS_TONE: Record<string, string> = {
  SUCCEEDED: 'border-lime/40 text-lime',
  PENDING: 'border-amber/40 text-amber',
  FAILED: 'border-danger/40 text-danger',
  REFUNDED: 'text-muted',
  CANCELLED: 'text-muted',
};
const FILTERS = ['', 'SUCCEEDED', 'PENDING', 'REFUNDED', 'CANCELLED'];

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ estado?: string; page?: string; conectado?: string; error?: string }> }) {
  await requireOrganizer('/dashboard/cobros');
  const sp = await searchParams;
  const status = FILTERS.includes(sp.estado ?? '') ? sp.estado : '';
  const [info, list] = await Promise.all([
    api<PaymentAccountInfo>('/me/payment-account'),
    api<RegistrationPaymentList>(`/me/registration-payments${qs({ status, page: sp.page, pageSize: 20 })}`),
  ]);
  const a = info.account;
  const connected = a?.status === 'CONNECTED';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="section-title">Cobros</h1>
        <p className="text-sm text-muted">Cobra las inscripciones de tus partidas en línea. El dinero llega directo a tu cuenta de Mercado Pago.</p>
      </div>

      {sp.conectado && (
        <p role="status" className="flex items-center gap-2 rounded-xl border border-lime/40 bg-lime/10 p-3 text-sm text-lime">
          <CheckCircle2 className="size-4 shrink-0" /> Cuenta de Mercado Pago conectada.
        </p>
      )}
      {sp.error && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {sp.error}
        </p>
      )}

      <section className="card space-y-4 p-5" aria-labelledby="account-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-neon/10 text-neon">
              <Wallet className="size-5" aria-hidden />
            </span>
            <div>
              <h2 id="account-title" className="text-lg font-bold uppercase">
                Cuenta de cobro
              </h2>
              <p className="text-sm text-muted">
                {!a || a.status === 'DISCONNECTED'
                  ? 'Sin cuenta conectada'
                  : a.provider === 'SANDBOX'
                    ? 'Cuenta de prueba: los pagos son simulados, sin dinero real'
                    : `Mercado Pago · cuenta ${a.externalUserId}${a.liveMode ? '' : ' (modo prueba)'}`}
              </p>
            </div>
          </div>
          {a && a.status !== 'DISCONNECTED' && <DisconnectForm />}
        </div>

        {a?.status === 'NEEDS_RECONNECT' && (
          <p className="flex items-start gap-2 rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm text-amber">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            La conexión venció o fue revocada en Mercado Pago. Vuelve a conectar la cuenta para seguir cobrando.
          </p>
        )}

        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted">Comisión de Arena (plan {info.plan})</dt>
            <dd className="font-semibold">{info.feePercent} % por inscripción cobrada</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Reserva de cupo mientras el jugador paga</dt>
            <dd className="font-semibold">{info.holdMinutes} minutos</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Conectada desde</dt>
            <dd className="font-semibold">{connected && a ? formatDateTime(a.connectedAt) : '—'}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted">
          Mercado Pago descuenta su propia comisión y la de Arena de cada pago. Los reembolsos devuelven el importe completo al jugador.
        </p>

        {!connected && (
          <div className="flex flex-wrap items-start gap-3 border-t border-line pt-4">
            {info.providers.mercadopago ? (
              <form action={connectMercadoPagoAction}>
                <button className="btn-primary">{a ? 'Volver a conectar Mercado Pago' : 'Conectar Mercado Pago'}</button>
              </form>
            ) : (
              <p className="text-sm text-muted">El cobro con Mercado Pago todavía no está configurado en esta plataforma.</p>
            )}
            {info.providers.sandbox && <SandboxConnectForm />}
          </div>
        )}
        {connected && (
          <p className="border-t border-line pt-4 text-sm">
            Para cobrar una partida, marca <b>«Cobrar la inscripción en línea»</b> al{' '}
            <Link href="/dashboard/torneos/nuevo" className="font-semibold text-neon hover:underline">
              crearla
            </Link>{' '}
            o editarla.
          </p>
        )}
      </section>

      <section className="card min-w-0 p-5" aria-labelledby="totals-title">
        <h2 id="totals-title" className="mb-3 text-lg font-bold uppercase">
          Cobrado
        </h2>
        {list.totals.length ? (
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.totals.map((t) => (
              <div key={t.currency} className="rounded-xl border border-line p-4">
                <dt className="text-xs text-muted">
                  {t.payments} {t.payments === 1 ? 'inscripción pagada' : 'inscripciones pagadas'} · {t.currency}
                </dt>
                <dd className="mt-1 font-display text-2xl font-bold tabular-nums">{formatAmount(t.net, t.currency)}</dd>
                <dd className="text-xs text-muted">
                  {formatAmount(t.gross, t.currency)} cobrados − {formatAmount(t.fee, t.currency)} de comisión de Arena
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted">Todavía no hay inscripciones pagadas en línea.</p>
        )}
      </section>

      <section className="min-w-0 space-y-3" aria-labelledby="list-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="list-title" className="text-lg font-bold uppercase">
            Pagos de inscripción
          </h2>
          <nav className="flex flex-wrap gap-1.5" aria-label="Estado del pago">
            {FILTERS.map((f) => (
              <Link
                key={f || 'all'}
                href={`/dashboard/cobros${f ? `?estado=${f}` : ''}`}
                aria-current={status === f ? 'page' : undefined}
                className={`chip text-xs ${status === f ? 'border-neon text-neon' : 'hover:text-ink'}`}
              >
                {f ? REGISTRATION_PAYMENT_STATUS_LABEL[f] : 'Todos'}
              </Link>
            ))}
          </nav>
        </div>
        <div className="card relative overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Pagos de inscripción</caption>
            <thead className="text-left text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Fecha</th>
                <th scope="col" className="py-3 font-semibold">Partida y participante</th>
                <th scope="col" className="py-3 text-right font-semibold">Importe</th>
                <th scope="col" className="py-3 text-right font-semibold">Comisión</th>
                <th scope="col" className="px-4 py-3 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((p) => (
                <tr key={p.id} className="border-t border-line align-top">
                  <td className="px-4 py-2.5 text-muted">{formatDateTime(p.paidAt ?? p.createdAt)}</td>
                  <td className="py-2.5 pr-3">
                    <Link href={`/dashboard/torneos/${p.tournament.id}`} className="font-semibold hover:text-neon">
                      {p.tournament.name}
                    </Link>
                    <span className="block text-xs text-muted">
                      {p.participant ?? '—'} · @{p.payer.username}
                      {p.provider === 'SANDBOX' && ' · prueba'}
                    </span>
                  </td>
                  <td className="py-2.5 text-right font-semibold tabular-nums">{formatAmount(p.amount, p.currency)}</td>
                  <td className="py-2.5 text-right tabular-nums text-muted">{formatAmount(p.platformFee, p.currency)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`chip text-[11px] ${STATUS_TONE[p.status] ?? ''}`}>{REGISTRATION_PAYMENT_STATUS_LABEL[p.status]}</span>
                    {(p.refundReason || (p.failureReason && p.status !== 'SUCCEEDED')) && (
                      <span className="mt-1 block max-w-56 text-xs text-muted">{p.refundReason ?? p.failureReason}</span>
                    )}
                    {p.status === 'SUCCEEDED' && (
                      <div className="mt-1">
                        <RefundForm paymentId={p.id} amount={formatAmount(p.amount, p.currency)} />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.items.length && <p className="p-4 text-sm text-muted">No hay pagos con este filtro.</p>}
        </div>
        <Pagination page={list.page} totalPages={list.totalPages} hrefFor={(n) => `/dashboard/cobros${qs({ estado: status, page: n })}`} />
      </section>
    </div>
  );
}
