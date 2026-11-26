import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api, apiOrNull } from '@/lib/api';
import type { AdminPayouts, PayoutBankDetails } from '@/lib/types';
import { COUNTRIES, formatAmount, PAYOUT_ACCOUNT_TYPE_LABEL } from '@/lib/format';
import { createPayoutAction } from '@/app/actions';
import { ActionForm } from '../../rankings/forms';

export const metadata: Metadata = { title: 'Liquidar organizador' };

type Props = { params: Promise<{ organizerId: string }> };

/** Datos bancarios completos (la consulta queda en la auditoría) y registro de la transferencia por moneda. */
export default async function PayoutDetailPage({ params }: Props) {
  const { organizerId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(organizerId)) notFound();
  const [data, bank] = await Promise.all([
    api<AdminPayouts>('/admin/payouts'),
    apiOrNull<PayoutBankDetails>(`/admin/payouts/organizers/${organizerId}/bank`),
  ]);
  const rows = data.balances.filter((b) => b.organizerId === organizerId);
  const organizer = rows[0]?.organizer;
  if (!rows.length && !bank) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/liquidaciones" className="text-sm text-muted hover:text-neon">
          ← Liquidaciones
        </Link>
        <h2 className="mt-1 text-xl font-bold uppercase">{organizer?.displayName ?? bank?.organizer}</h2>
        {organizer && (
          <p className="text-sm text-muted">
            @{organizer.username} · {organizer.email}
          </p>
        )}
      </div>

      <section className="card p-5" aria-labelledby="bank-title">
        <h3 id="bank-title" className="mb-3 text-lg font-bold uppercase">
          Cuenta de destino
        </h3>
        {bank ? (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Item label="Titular" value={bank.holderName} />
            <Item label="Documento" value={bank.documentId} />
            <Item label="Banco o billetera" value={bank.bankName} />
            <Item label="Tipo" value={PAYOUT_ACCOUNT_TYPE_LABEL[bank.accountType] ?? bank.accountType} />
            <Item label="Número de cuenta" value={bank.accountNumber} mono />
            <Item label="País" value={COUNTRIES[bank.country] ?? bank.country} />
          </dl>
        ) : (
          <p className="text-sm text-muted">El organizador no registró datos de liquidación: pídele que los complete en «Cobros».</p>
        )}
        {bank && !bank.enabled && (
          <p className="mt-3 text-xs text-amber">El organizador desactivó el cobro centralizado; lo ya cobrado se le liquida igual.</p>
        )}
        <p className="mt-3 text-xs text-muted">Esta consulta queda registrada en la auditoría.</p>
      </section>

      {rows.map((b) => (
        <section key={b.currency} className="card space-y-4 p-5" aria-label={`Saldo en ${b.currency}`}>
          <h3 className="text-lg font-bold uppercase">Saldo en {b.currency}</h3>
          <dl className="grid gap-3 text-sm sm:grid-cols-4">
            <Item label={`Cobrado (${b.eligible.payments} ${b.eligible.payments === 1 ? 'pago' : 'pagos'} de partidas terminadas)`} value={formatAmount(b.eligible.gross, b.currency)} />
            <Item label="Comisión de Arena" value={`−${formatAmount(b.eligible.fee, b.currency)}`} />
            <Item label="Reembolsos ya liquidados" value={b.deductions ? `−${formatAmount(b.deductions, b.currency)}` : '—'} />
            <Item label="Por transferir" value={formatAmount(b.payable, b.currency)} strong />
          </dl>
          {b.held.payments > 0 && (
            <p className="text-xs text-muted">
              Además hay {formatAmount(b.held.net, b.currency)} retenidos de {b.held.payments} {b.held.payments === 1 ? 'pago' : 'pagos'} de partidas que aún no terminan.
            </p>
          )}
          {b.payable > 0 && bank ? (
            <ActionForm
              action={createPayoutAction}
              buttons={[{ label: `Registrar transferencia de ${formatAmount(b.payable, b.currency)}` }]}
              className="space-y-3 border-t border-line pt-4"
            >
              <input type="hidden" name="organizerId" value={organizerId} />
              <input type="hidden" name="currency" value={b.currency} />
              <p className="text-sm">Haz primero la transferencia desde el banco y luego regístrala aquí. Se liquidan todos los pagos listos en este momento.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="label">Número de operación</span>
                  <input name="reference" required minLength={3} maxLength={120} className="input" />
                </label>
                <label className="block">
                  <span className="label">Nota (opcional)</span>
                  <input name="note" maxLength={300} className="input" />
                </label>
              </div>
            </ActionForm>
          ) : (
            <p className="border-t border-line pt-4 text-sm text-muted">
              {b.payable > 0 ? 'Faltan los datos de liquidación para transferir.' : 'No hay saldo para transferir en esta moneda.'}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}

function Item({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`break-all ${mono ? 'font-mono' : ''} ${strong ? 'font-display text-2xl font-bold' : 'font-semibold'}`}>{value}</dd>
    </div>
  );
}
