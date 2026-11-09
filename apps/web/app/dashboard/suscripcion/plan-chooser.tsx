'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CreditCard, Tag } from 'lucide-react';
import { subscriptionCheckoutAction, type QuoteState } from '@/app/actions';
import { FormMessage, SubmitButton, usePersistentAction } from '@/components/forms';
import { FEATURE_LABEL, type Plan } from '@/components/plan-cards';
import { formatAmount, formatDate, formatMoney } from '@/lib/format';
import type { BillingPeriod, PaymentProvider } from '@/lib/types';

const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/**
 * Elegir plan y periodo → revisar la cotización (descuento, crédito, cuándo se aplica) → pagar.
 * La clave de idempotencia se mantiene mientras no cambie la selección: un doble clic no crea dos cobros.
 */
export function PlanChooser({
  plans,
  currentCode,
  currentPeriod,
  providers,
}: {
  plans: Plan[];
  currentCode: string;
  currentPeriod: BillingPeriod;
  providers: { code: PaymentProvider; name: string }[];
}) {
  const [period, setPeriod] = useState<BillingPeriod>(currentPeriod);
  const [planCode, setPlanCode] = useState<string>(plans.find((p) => p.code !== currentCode && Number(p.priceMonthly) > 0)?.code ?? currentCode);
  const [promo, setPromo] = useState('');
  const [state, onSubmit, pending] = usePersistentAction<QuoteState>(subscriptionCheckoutAction, {});
  // Clave de idempotencia: la misma mientras no cambie la selección (un reintento no crea otro pago)
  const key = useRef('');
  useEffect(() => {
    key.current = '';
  }, [planCode, period, promo]);

  const q = state.quote;
  const fresh = q && q.plan.code === planCode && q.billingPeriod === period;
  const selected = useMemo(() => plans.find((p) => p.code === planCode), [plans, planCode]);

  return (
    <form
      method="post"
      onSubmitCapture={(e) => {
        key.current ||= newKey();
        (e.currentTarget.elements.namedItem('idempotencyKey') as HTMLInputElement | null)?.setAttribute('value', key.current);
      }}
      onSubmit={onSubmit}
      className="space-y-5"
    >
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Periodo de facturación</legend>
        {(['MONTHLY', 'YEARLY'] as const).map((p) => (
          <label key={p} className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm font-semibold ${period === p ? 'border-neon bg-neon/10 text-neon' : 'border-line text-muted hover:text-ink'}`}>
            <input type="radio" name="billingPeriod" value={p} checked={period === p} onChange={() => setPeriod(p)} className="sr-only" />
            {p === 'MONTHLY' ? 'Mensual' : 'Anual'}
          </label>
        ))}
        <span className="text-xs text-muted">El plan anual equivale a unos 2 meses gratis.</span>
      </fieldset>

      <fieldset className="grid gap-4 md:grid-cols-3">
        <legend className="sr-only">Plan</legend>
        {plans.map((p) => {
          const price = period === 'YEARLY' ? p.priceYearly : p.priceMonthly;
          const free = Number(p.priceMonthly) === 0;
          const active = planCode === p.code;
          return (
            <label key={p.id} className={`card relative flex cursor-pointer flex-col p-5 transition ${active ? 'border-neon shadow-neon' : 'hover:border-neon/40'}`}>
              <input type="radio" name="planCode" value={p.code} checked={active} onChange={() => setPlanCode(p.code)} className="sr-only" />
              {p.code === currentCode && <span className="absolute -top-3 left-5 rounded-full bg-surface-3 px-3 py-0.5 text-xs font-bold">Tu plan</span>}
              <span className="flex items-center justify-between gap-2">
                <span className="text-xl font-bold uppercase">{p.name}</span>
                <span className={`grid size-5 place-items-center rounded-full border ${active ? 'border-neon bg-neon text-bg' : 'border-line'}`} aria-hidden>
                  {active && <Check className="size-3.5" />}
                </span>
              </span>
              <span className="mt-2 font-display text-3xl font-bold">
                {free ? 'Gratis' : formatMoney(price, p.currency)}
                {!free && <span className="text-sm font-medium text-muted">{period === 'YEARLY' ? '/año' : '/mes'}</span>}
              </span>
              <span className="mt-3 space-y-1 text-xs text-muted">
                <span className="block">{p.maxActiveTournaments === null ? 'Torneos activos ilimitados' : `${p.maxActiveTournaments} torneos activos`}</span>
                <span className="block">{p.maxParticipantsPerTournament} participantes por torneo</span>
                <span className="block">{p.maxAdmins === 1 ? 'Un administrador' : `Hasta ${p.maxAdmins} administradores`}</span>
                {p.features.slice(0, 6).map((f) => (
                  <span key={f.featureKey} className="block">
                    {FEATURE_LABEL[f.featureKey] ?? f.featureKey}
                  </span>
                ))}
              </span>
            </label>
          );
        })}
      </fieldset>

      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 basis-56">
          <span className="label flex items-center gap-1.5">
            <Tag className="size-3.5" aria-hidden /> Código promocional (opcional)
          </span>
          <input name="promoCode" value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} maxLength={40} className="input uppercase" placeholder="LANZAMIENTO50" autoComplete="off" />
        </label>
        <SubmitButton name="intent" value="quote" pending={pending} className="btn-ghost" pendingText="Calculando…">
          Revisar cambio
        </SubmitButton>
      </div>

      {fresh && (
        <div className="card space-y-3 border-neon/40 p-5" aria-live="polite">
          <p className="text-sm">{q.message}</p>
          {q.change === 'IMMEDIATE' && (
            <dl className="max-w-sm space-y-1 text-sm">
              <Line k={`${q.plan.name} · ${q.billingPeriod === 'YEARLY' ? 'anual' : 'mensual'}`} v={formatAmount(q.listAmount, q.currency)} />
              {q.discountAmount > 0 && <Line k="Descuento promocional" v={`− ${formatAmount(q.discountAmount, q.currency)}`} />}
              {q.creditAmount > 0 && <Line k="Saldo no usado de tu plan actual" v={`− ${formatAmount(q.creditAmount, q.currency)}`} />}
              <div className="flex justify-between border-t border-line pt-1.5 font-bold">
                <dt>Total a pagar</dt>
                <dd className="tabular-nums">{formatAmount(q.amount, q.currency)}</dd>
              </div>
              {q.periodEnd && <p className="pt-1 text-xs text-muted">Periodo cubierto hasta el {formatDate(q.periodEnd)}.</p>}
            </dl>
          )}
          {(q.change === 'SCHEDULED' || q.change === 'TO_FREE') && q.effectiveAt && (
            <p className="text-sm text-muted">Se aplicará el {formatDate(q.effectiveAt)}.</p>
          )}
          {q.change !== 'CURRENT' && (
            <div className="flex flex-wrap items-end gap-3">
              {q.change === 'IMMEDIATE' && q.amount > 0 && providers.length > 1 && (
                <label>
                  <span className="label">Medio de pago</span>
                  <select name="provider" className="input w-auto" defaultValue={providers[0].code}>
                    {providers.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {q.change === 'IMMEDIATE' && q.amount > 0 && providers.length === 1 && <input type="hidden" name="provider" value={providers[0].code} />}
              <input type="hidden" name="idempotencyKey" defaultValue="" />
              <SubmitButton name="intent" value="pay" pending={pending} className={q.change === 'TO_FREE' ? 'btn-danger' : 'btn-primary'} pendingText="Procesando…">
                {q.change === 'IMMEDIATE' ? (
                  <>
                    <CreditCard className="size-4" /> {q.amount > 0 ? `Pagar ${formatAmount(q.amount, q.currency)}` : 'Activar sin costo'}
                  </>
                ) : q.change === 'TO_FREE' ? (
                  'Confirmar paso a Free'
                ) : (
                  'Programar cambio'
                )}
              </SubmitButton>
              {q.change === 'IMMEDIATE' && q.amount > 0 && providers.length === 0 && (
                <p className="text-sm text-amber">No hay medios de pago habilitados en este momento.</p>
              )}
            </div>
          )}
        </div>
      )}
      {!fresh && selected && planCode === currentCode && period === currentPeriod && <p className="text-sm text-muted">Este es tu plan actual.</p>}
      <FormMessage state={state} />
      <p className="text-xs text-muted">
        Los pagos de tu suscripción a Arena son independientes de las cuotas de inscripción que configuras en tus torneos. El plan nunca modifica tu verificación,
        reputación ni posiciones en rankings.
      </p>
    </form>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}
