import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { AdminPayouts } from '@/lib/types';
import { formatAmount, formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Liquidaciones' };

const plural = (n: number) => `${n} ${n === 1 ? 'pago' : 'pagos'}`;

/** Cobro centralizado: lo que Arena cobró por cada organizador y debe transferirle, e historial de transferencias. */
export default async function PayoutsPage() {
  const data = await api<AdminPayouts>('/admin/payouts');
  const due = data.balances.filter((b) => b.payable > 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold uppercase">Liquidaciones a organizadores</h2>
        <p className="text-sm text-muted">
          Inscripciones cobradas en la cuenta de Mercado Pago de Arena para organizadores sin cuenta propia. Un pago se puede liquidar
          cuando su partida terminó; los reembolsos de pagos ya liquidados se descuentan.
        </p>
      </div>

      <section className="card relative overflow-x-auto p-0" aria-labelledby="balances-title">
        <h3 id="balances-title" className="px-4 pt-4 text-lg font-bold uppercase">
          Saldos {due.length > 0 && <span className="chip ml-2 border-amber/40 text-xs text-amber">{due.length} por transferir</span>}
        </h3>
        <table className="mt-2 w-full min-w-[760px] text-sm">
          <caption className="sr-only">Saldos por organizador y moneda</caption>
          <thead className="text-left text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Organizador</th>
              <th scope="col" className="py-3 font-semibold">Cuenta de destino</th>
              <th scope="col" className="py-3 text-right font-semibold">Retenido</th>
              <th scope="col" className="py-3 text-right font-semibold">Descuentos</th>
              <th scope="col" className="py-3 text-right font-semibold">Por transferir</th>
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.balances.map((b) => (
              <tr key={`${b.organizerId}:${b.currency}`} className="border-t border-line align-top">
                <td className="px-4 py-2.5">
                  <span className="font-semibold">{b.organizer?.displayName ?? b.organizerId}</span>
                  {b.organizer && <span className="block text-xs text-muted">@{b.organizer.username}</span>}
                </td>
                <td className="py-2.5 text-muted">
                  {b.payoutProfile ? `${b.payoutProfile.bankName} ${b.payoutProfile.accountNumberMasked}` : 'Sin datos de liquidación'}
                  {b.payoutProfile && !b.payoutProfile.enabled && <span className="block text-xs">(cobro centralizado desactivado)</span>}
                </td>
                <td className="py-2.5 text-right tabular-nums text-muted">
                  {formatAmount(b.held.net, b.currency)}
                  <span className="block text-xs">{plural(b.held.payments)}</span>
                </td>
                <td className="py-2.5 text-right tabular-nums text-muted">{b.deductions ? `−${formatAmount(b.deductions, b.currency)}` : '—'}</td>
                <td className={`py-2.5 text-right font-semibold tabular-nums ${b.payable < 0 ? 'text-danger' : ''}`}>
                  {formatAmount(b.payable, b.currency)}
                  <span className="block text-xs font-normal text-muted">
                    {plural(b.eligible.payments)} · {formatAmount(b.eligible.gross, b.currency)} − {formatAmount(b.eligible.fee, b.currency)} comisión
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link
                    href={`/admin/liquidaciones/${b.organizerId}`}
                    className={b.payable > 0 ? 'btn-primary px-3 py-1.5 text-xs' : 'btn-ghost px-3 py-1.5 text-xs'}
                  >
                    {b.payable > 0 ? 'Liquidar' : 'Ver'}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.balances.length && <p className="p-4 text-sm text-muted">No hay saldos de cobro centralizado.</p>}
      </section>

      <section className="card relative overflow-x-auto p-0" aria-labelledby="history-title">
        <h3 id="history-title" className="px-4 pt-4 text-lg font-bold uppercase">
          Transferencias registradas
        </h3>
        <table className="mt-2 w-full min-w-[680px] text-sm">
          <caption className="sr-only">Historial de transferencias</caption>
          <thead className="text-left text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Fecha</th>
              <th scope="col" className="py-3 font-semibold">Organizador</th>
              <th scope="col" className="py-3 font-semibold">Operación</th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">Transferido</th>
            </tr>
          </thead>
          <tbody>
            {data.payouts.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="px-4 py-2.5 text-muted">{formatDateTime(p.paidAt)}</td>
                <td className="py-2.5">{p.organizer?.displayName}</td>
                <td className="py-2.5">
                  {p.reference}
                  <span className="block text-xs text-muted">
                    {plural(p._count.payments)} · por @{p.paidBy?.username}
                    {p.note && ` · ${p.note}`}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatAmount(p.amount, p.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.payouts.length && <p className="p-4 text-sm text-muted">Todavía no hay transferencias.</p>}
      </section>
    </div>
  );
}
