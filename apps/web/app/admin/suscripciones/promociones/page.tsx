import type { Metadata } from 'next';
import { api } from '@/lib/api';
import type { AdminPlan, PromoCode } from '@/lib/types';
import { formatAmount, formatDate } from '@/lib/format';
import { createPromoAction, togglePromoAction } from '@/app/actions';
import { TzOffsetInput } from '@/components/forms';
import { ActionForm } from '../../rankings/forms';
import { BillingTabs } from '../tabs';

export const metadata: Metadata = { title: 'Promociones' };

export default async function PromotionsPage() {
  const [promos, plans] = await Promise.all([api<PromoCode[]>('/admin/billing/promotions'), api<AdminPlan[]>('/admin/billing/plans')]);
  const paid = plans.filter((p) => Number(p.priceMonthly) > 0);
  const currency = paid[0]?.currency ?? 'USD';
  const now = Date.now();

  return (
    <div className="space-y-5">
      <BillingTabs />
      <section className="card p-5" aria-labelledby="new-promo">
        <h2 id="new-promo" className="mb-3 text-lg font-bold uppercase">
          Nuevo código promocional
        </h2>
        <ActionForm action={createPromoAction} buttons={[{ label: 'Crear código' }]} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="label">Código</span>
              <input name="code" required pattern="[A-Za-z0-9_\-]{3,40}" className="input uppercase" placeholder="LANZAMIENTO50" />
            </label>
            <label className="block">
              <span className="label">Tipo de descuento</span>
              <select name="discountType" className="input">
                <option value="percent">Porcentaje (%)</option>
                <option value="amount">Monto fijo ({currency})</option>
              </select>
            </label>
            <label className="block">
              <span className="label">Valor</span>
              <input name="value" type="number" min="0.01" step="0.01" required className="input" />
            </label>
            <label className="block">
              <span className="label">Usos máximos</span>
              <input name="maxRedemptions" type="number" min="1" className="input" placeholder="Sin límite" />
            </label>
            <label className="block">
              <span className="label">Vence</span>
              <input name="validUntil" type="datetime-local" className="input" />
            </label>
            <label className="block sm:col-span-2 lg:col-span-3">
              <span className="label">Descripción interna</span>
              <input name="description" maxLength={200} className="input" />
            </label>
          </div>
          <fieldset>
            <legend className="label">Aplica a (sin marcar = todos los planes de pago)</legend>
            <div className="flex flex-wrap gap-4">
              {paid.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="plans" value={p.code} className="size-4 accent-[var(--color-neon)]" />
                  {p.name}
                </label>
              ))}
            </div>
          </fieldset>
          <TzOffsetInput />
        </ActionForm>
        <p className="mt-2 text-xs text-muted">El descuento solo se aplica al pago en el que se ingresa el código.</p>
      </section>

      <div className="card relative overflow-x-auto p-0">
        <table className="w-full min-w-[680px] text-sm">
          <caption className="sr-only">Códigos promocionales</caption>
          <thead className="text-left text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Código</th>
              <th scope="col" className="py-3 font-semibold">Descuento</th>
              <th scope="col" className="py-3 font-semibold">Planes</th>
              <th scope="col" className="py-3 font-semibold">Usos</th>
              <th scope="col" className="py-3 font-semibold">Vigencia</th>
              <th scope="col" className="px-4 py-3 font-semibold"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {promos.map((p) => {
              const expired = p.validUntil && new Date(p.validUntil).getTime() < now;
              const used = p.maxRedemptions !== null && p.redemptions >= p.maxRedemptions;
              return (
                <tr key={p.id} className="border-t border-line align-top">
                  <td className="px-4 py-2.5">
                    <span className="font-mono font-semibold">{p.code}</span>
                    {p.description && <span className="block text-xs text-muted">{p.description}</span>}
                  </td>
                  <td className="py-2.5 pr-3">{p.percentOff ? `${p.percentOff} %` : formatAmount(p.amountOff ?? 0, currency)}</td>
                  <td className="py-2.5 pr-3 text-muted">{p.appliesToPlans.length ? p.appliesToPlans.join(', ') : 'Todos'}</td>
                  <td className="py-2.5 pr-3 tabular-nums">
                    {p.redemptions}
                    {p.maxRedemptions !== null && ` / ${p.maxRedemptions}`}
                  </td>
                  <td className="py-2.5 pr-3 text-muted">
                    {formatDate(p.validFrom)} – {p.validUntil ? formatDate(p.validUntil) : 'sin fin'}
                    {!p.isActive ? (
                      <span className="block text-xs text-amber">Desactivado</span>
                    ) : expired ? (
                      <span className="block text-xs text-amber">Vencido</span>
                    ) : used ? (
                      <span className="block text-xs text-amber">Agotado</span>
                    ) : (
                      <span className="block text-xs text-lime">Vigente</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <ActionForm action={togglePromoAction} buttons={[{ label: p.isActive ? 'Desactivar' : 'Activar', danger: p.isActive }]} className="flex justify-end">
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="isActive" value={String(!p.isActive)} />
                    </ActionForm>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!promos.length && <p className="p-4 text-sm text-muted">Todavía no hay códigos promocionales.</p>}
      </div>
    </div>
  );
}
