import type { Metadata } from 'next';
import Link from 'next/link';
import { api, qs } from '@/lib/api';
import type { AdminPlan, AdminSubscription, Paginated } from '@/lib/types';
import { formatAmount, formatDate, PERIOD_LABEL, PROVIDER_LABEL, SUBSCRIPTION_STATUS_LABEL } from '@/lib/format';
import { Pagination } from '@/components/ui';
import { BillingTabs } from '../tabs';

export const metadata: Metadata = { title: 'Suscriptores' };

type SP = { status?: string; plan?: string; q?: string; scheduledCancel?: string; page?: string };

export default async function SubscribersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [data, plans] = await Promise.all([
    api<Paginated<AdminSubscription>>(`/admin/billing/subscriptions${qs({ status: sp.status, plan: sp.plan, q: sp.q, scheduledCancel: sp.scheduledCancel, page: sp.page, pageSize: 20 })}`),
    api<AdminPlan[]>('/admin/billing/plans'),
  ]);

  return (
    <div className="space-y-5">
      <BillingTabs />
      <form className="flex flex-wrap items-end gap-2" role="search">
        <label className="min-w-0 flex-1 basis-48">
          <span className="label">Organizador</span>
          <input name="q" defaultValue={sp.q} className="input" placeholder="Nombre o usuario" />
        </label>
        <label>
          <span className="label">Plan</span>
          <select name="plan" defaultValue={sp.plan ?? ''} className="input w-auto">
            <option value="">Todos</option>
            {plans.map((p) => (
              <option key={p.id} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Estado</span>
          <select name="status" defaultValue={sp.status ?? ''} className="input w-auto">
            <option value="">Vigentes</option>
            {Object.entries(SUBSCRIPTION_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="scheduledCancel" value="true" defaultChecked={sp.scheduledCancel === 'true'} className="size-4 accent-[var(--color-neon)]" />
          Cancelación programada
        </label>
        <button className="btn-primary px-3 py-2 text-sm">Filtrar</button>
      </form>

      <p className="text-sm text-muted">{data.total} suscripciones</p>
      <div className="card relative overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <caption className="sr-only">Suscripciones</caption>
          <thead className="text-left text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Organizador</th>
              <th scope="col" className="py-3 font-semibold">Plan</th>
              <th scope="col" className="py-3 font-semibold">Estado</th>
              <th scope="col" className="py-3 font-semibold">Periodo hasta</th>
              <th scope="col" className="py-3 text-right font-semibold">Último pago</th>
              <th scope="col" className="px-4 py-3 font-semibold">Medio</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((s) => (
              <tr key={s.id} className="border-t border-line align-top">
                <td className="px-4 py-2.5">
                  <Link href={`/organizer/${s.organizer.user.username}`} className="font-semibold hover:text-neon">
                    {s.organizer.displayName}
                  </Link>
                  <span className="block text-xs text-muted">{s.organizer.user.email}</span>
                </td>
                <td className="py-2.5 pr-3">
                  {s.plan.name}
                  {s.plan.code !== 'FREE' && <span className="block text-xs text-muted">{PERIOD_LABEL[s.billingPeriod]}</span>}
                  {s.pendingPlan && <span className="block text-xs text-amber">→ {s.pendingPlan.name} al renovar</span>}
                  {s.promoCode && <span className="block text-xs text-muted">Cupón {s.promoCode.code}</span>}
                </td>
                <td className="py-2.5 pr-3">
                  {SUBSCRIPTION_STATUS_LABEL[s.status]}
                  {s.cancelAtPeriodEnd && <span className="block text-xs text-amber">Cancela al final del periodo</span>}
                  {s.status === 'PAST_DUE' && s.graceUntil && <span className="block text-xs text-muted">Gracia hasta {formatDate(s.graceUntil)}</span>}
                  {s.cancelledAt && !s.isCurrent && <span className="block text-xs text-muted">{formatDate(s.cancelledAt)}</span>}
                </td>
                <td className="py-2.5 pr-3 text-muted">{s.currentPeriodEnd ? formatDate(s.currentPeriodEnd) : '—'}</td>
                <td className="py-2.5 text-right tabular-nums">
                  {s.payments[0] ? (
                    <>
                      {formatAmount(s.payments[0].amount, s.payments[0].currency)}
                      <span className="block text-xs text-muted">{formatDate(s.payments[0].paidAt)}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted">{s.provider ? PROVIDER_LABEL[s.provider] : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.items.length && <p className="p-4 text-sm text-muted">No hay suscripciones con estos filtros.</p>}
      </div>
      <Pagination page={data.page} totalPages={data.totalPages} hrefFor={(n) => `/admin/suscripciones/suscriptores${qs({ ...sp, page: n })}`} />
    </div>
  );
}
