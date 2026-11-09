import type { Metadata } from 'next';
import { api } from '@/lib/api';
import type { AdminPlan } from '@/lib/types';
import { formatMoney } from '@/lib/format';
import { savePlanAction } from '@/app/actions';
import { FEATURE_LABEL } from '@/components/plan-cards';
import { ActionForm } from '../../rankings/forms';
import { BillingTabs } from '../tabs';

export const metadata: Metadata = { title: 'Planes' };

export default async function AdminPlansPage() {
  const plans = await api<AdminPlan[]>('/admin/billing/plans');
  return (
    <div className="space-y-5">
      <BillingTabs />
      <p className="text-sm text-muted">
        Los precios y límites se aplican de inmediato a las nuevas contrataciones; quienes ya pagaron conservan su precio hasta la renovación. Un plan
        desactivado deja de ofrecerse, pero sus suscriptores lo mantienen.
      </p>
      {plans.map((p) => (
        <details key={p.id} className="card group p-0">
          <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 p-5">
            <span className="text-xl font-bold uppercase">{p.name}</span>
            <span className="chip text-[11px]">{p.code}</span>
            {p.status === 'INACTIVE' && <span className="chip border-amber/40 text-[11px] text-amber">Inactivo</span>}
            <span className="text-sm text-muted">
              {Number(p.priceMonthly) === 0 ? 'Gratis' : `${formatMoney(p.priceMonthly, p.currency)}/mes · ${formatMoney(p.priceYearly, p.currency)}/año`}
            </span>
            <span className="ml-auto text-sm text-muted">{p._count.subscriptions} {p._count.subscriptions === 1 ? 'organizador' : 'organizadores'}</span>
          </summary>
          <div className="border-t border-line p-5">
            <PlanForm plan={p} />
          </div>
        </details>
      ))}
      <details className="card p-0">
        <summary className="cursor-pointer p-5 text-lg font-bold uppercase">Crear plan</summary>
        <div className="border-t border-line p-5">
          <PlanForm />
        </div>
      </details>
    </div>
  );
}

function PlanForm({ plan }: { plan?: AdminPlan }) {
  const free = plan?.code === 'FREE';
  const enabled = new Set(plan?.features.filter((f) => f.enabled).map((f) => f.featureKey) ?? []);
  return (
    <ActionForm action={savePlanAction} buttons={[{ label: plan ? 'Guardar cambios' : 'Crear plan' }]} className="space-y-4">
      {plan && <input type="hidden" name="id" value={plan.id} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {!plan && <Field label="Código" name="code" required pattern="[A-Za-z][A-Za-z0-9_]{1,29}" placeholder="ENTERPRISE" />}
        <Field label="Nombre" name="name" defaultValue={plan?.name} required minLength={2} maxLength={40} />
        <Field label="Precio mensual" name="priceMonthly" type="number" step="0.01" min="0" defaultValue={plan?.priceMonthly ?? ''} required disabled={free} />
        <Field label="Precio anual" name="priceYearly" type="number" step="0.01" min="0" defaultValue={plan?.priceYearly ?? ''} required disabled={free} />
        <Field label="Moneda" name="currency" defaultValue={plan?.currency ?? 'USD'} pattern="[A-Za-z]{3}" maxLength={3} />
        <Field label="Torneos activos (vacío = ilimitado)" name="maxActiveTournaments" type="number" min="1" defaultValue={plan?.maxActiveTournaments ?? ''} />
        <Field label="Participantes por torneo" name="maxParticipantsPerTournament" type="number" min="2" defaultValue={plan?.maxParticipantsPerTournament ?? ''} required />
        <Field label="Administradores" name="maxAdmins" type="number" min="1" defaultValue={plan?.maxAdmins ?? 1} required />
        <Field label="Días de prueba" name="trialDays" type="number" min="0" max="90" defaultValue={plan?.trialDays ?? 0} disabled={free} />
        <Field label="Días de gracia" name="graceDays" type="number" min="0" max="60" defaultValue={plan?.graceDays ?? 7} />
        <Field label="Orden" name="sortOrder" type="number" min="0" defaultValue={plan?.sortOrder ?? 10} />
      </div>
      <label className="block">
        <span className="label">Descripción</span>
        <input name="description" defaultValue={plan?.description ?? ''} maxLength={300} className="input" />
      </label>
      <fieldset>
        <legend className="label">Funcionalidades</legend>
        <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(FEATURE_LABEL).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="features" value={key} defaultChecked={enabled.has(key)} className="size-4 accent-[var(--color-neon)]" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={!plan || plan.status === 'ACTIVE'} disabled={free} className="size-4 accent-[var(--color-neon)]" />
          Disponible para contratar
        </label>
        {free && <input type="hidden" name="active" value="on" />}
        <label className="min-w-0 flex-1 basis-56">
          <span className="label">Motivo del cambio (auditoría)</span>
          <input name="reason" minLength={5} maxLength={500} className="input" placeholder="Opcional" />
        </label>
      </div>
      {free && <p className="text-xs text-muted">Free es el plan de respaldo: no tiene precio ni prueba y no se puede desactivar.</p>}
    </ActionForm>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block min-w-0">
      <span className="label">{label}</span>
      <input {...props} className="input disabled:opacity-50" />
    </label>
  );
}
