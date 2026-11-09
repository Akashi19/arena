import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { BillingMetrics } from '@/lib/types';
import { formatAmount, formatDateTime } from '@/lib/format';
import { runBillingLifecycleAction } from '@/app/actions';
import { ActionForm } from '../rankings/forms';
import { BillingTabs } from './tabs';
import { RevenueChart } from './revenue-chart';

export const metadata: Metadata = { title: 'Suscripciones' };

export default async function BillingMetricsPage() {
  const m = await api<BillingMetrics>('/admin/billing/metrics');
  const main = m.revenue.find((r) => r.currency === 'USD') ?? m.revenue[0];

  return (
    <div className="space-y-6">
      <BillingTabs />

      {m.revenue.map((r) => (
        <section key={r.currency} className="space-y-4" aria-label={`Ingresos en ${r.currency}`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="MRR" value={formatAmount(r.mrr, r.currency)} hint="Ingreso recurrente mensual" />
            <Stat label="ARR" value={formatAmount(r.arr, r.currency)} hint="MRR × 12" />
            <Stat label="ARPU" value={formatAmount(r.arpu, r.currency)} hint={`MRR entre ${m.subscribers} organizadores`} />
            <Stat label="Ingresos" value={formatAmount(r.month, r.currency)} hint={`Este mes · ${formatAmount(r.year, r.currency)} en el año`} />
          </div>
          <div className="card p-5">
            <h2 className="text-lg font-bold uppercase">Pagos cobrados por mes ({r.currency})</h2>
            <p className="mb-4 text-xs text-muted">Últimos 12 meses, pagos confirmados.</p>
            <RevenueChart series={r.series} currency={r.currency} />
          </div>
        </section>
      ))}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="De pago" value={String(m.paying)} hint={`de ${m.subscribers} organizadores`} />
        <Stat label="Churn (30 días)" value={`${m.churn.rate} %`} hint={`${m.churn.last30Days} suscripciones de pago terminaron`} />
        <Stat label="FREE → PRO" value={`${m.conversion.freeToPro.rate} %`} hint={`${m.conversion.freeToPro.count} de ${m.conversion.freeToPro.base} organizadores`} />
        <Stat label="PRO → BUSINESS" value={`${m.conversion.proToBusiness.rate} %`} hint={`${m.conversion.proToBusiness.count} de ${m.conversion.proToBusiness.base} que tuvieron PRO`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="card min-w-0 p-5" aria-labelledby="by-plan">
          <h2 id="by-plan" className="mb-3 text-lg font-bold uppercase">
            Organizadores por plan
          </h2>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <caption className="sr-only">Suscripciones vigentes por plan y estado</caption>
              <thead className="text-left text-[11px] uppercase tracking-wider text-muted">
                <tr>
                  <th scope="col" className="py-2 font-semibold">Plan</th>
                  <th scope="col" className="py-2 text-right font-semibold">Total</th>
                  <th scope="col" className="py-2 text-right font-semibold">Activas</th>
                  <th scope="col" className="py-2 text-right font-semibold">En prueba</th>
                  <th scope="col" className="py-2 text-right font-semibold">Pago pendiente</th>
                </tr>
              </thead>
              <tbody>
                {m.byPlan.map((p) => (
                  <tr key={p.code} className="border-t border-line">
                    <th scope="row" className="py-2 text-left font-semibold">
                      <Link href={`/admin/suscripciones/suscriptores?plan=${p.code}`} className="hover:text-neon">
                        {p.name}
                      </Link>
                    </th>
                    <td className="py-2 text-right tabular-nums">{p.total}</td>
                    <td className="py-2 text-right tabular-nums">{p.active}</td>
                    <td className="py-2 text-right tabular-nums">{p.trial}</td>
                    <td className="py-2 text-right tabular-nums">{p.pastDue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="card space-y-3 p-5" aria-labelledby="attention">
          <h2 id="attention" className="text-lg font-bold uppercase">
            Requiere atención
          </h2>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/admin/suscripciones/pagos?status=PENDING" className="flex justify-between hover:text-neon">
                <span>Pagos pendientes</span> <span className="font-semibold tabular-nums">{m.pendingPayments}</span>
              </Link>
            </li>
            <li>
              <Link href="/admin/suscripciones/suscriptores?status=PAST_DUE" className="flex justify-between hover:text-neon">
                <span>En periodo de gracia</span> <span className="font-semibold tabular-nums">{m.pastDue}</span>
              </Link>
            </li>
            <li>
              <Link href="/admin/suscripciones/suscriptores?scheduledCancel=true" className="flex justify-between hover:text-neon">
                <span>Cancelaciones programadas</span> <span className="font-semibold tabular-nums">{m.scheduledCancels}</span>
              </Link>
            </li>
          </ul>
          <p className="text-xs text-muted">
            Los vencimientos se revisan solos cada 10 minutos (datos del {formatDateTime(m.generatedAt)})
          </p>
          <ActionForm action={runBillingLifecycleAction} buttons={[{ label: 'Revisar vencimientos ahora' }]} className="space-y-2">
            {null}
          </ActionForm>
        </section>
      </div>
      {!main && <p className="text-sm text-muted">Todavía no hay ingresos registrados.</p>}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted">{hint}</p>
    </div>
  );
}
