import type { Metadata } from 'next';
import { api } from '@/lib/api';
import { requireOrganizer } from '@/lib/session';
import { formatDate, formatMoney } from '@/lib/format';
import { PlanCards, FEATURE_LABEL, type Plan } from '@/components/plan-cards';

export const metadata: Metadata = { title: 'Mi suscripción' };

interface Summary {
  plan: { code: string; name: string; priceMonthly: string; priceYearly: string; currency: string; features: string[] };
  subscription: { status: string; billingPeriod: string; startedAt: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean } | null;
  usage: {
    activeTournaments: { used: number; limit: number | null };
    participantsPerTournament: { used: number; limit: number };
    admins: { used: number; limit: number };
  };
}

const STATUS: Record<string, string> = { TRIAL: 'Prueba', ACTIVE: 'Activa', PAST_DUE: 'Pago pendiente', CANCELLED: 'Cancelada', EXPIRED: 'Vencida' };

export default async function SubscriptionPage() {
  await requireOrganizer('/dashboard/suscripcion');
  const [s, plans] = await Promise.all([api<Summary>('/me/subscription'), api<Plan[]>('/plans', { auth: false })]);
  const sub = s.subscription;

  return (
    <div className="space-y-6">
      <h1 className="section-title">Mi suscripción</h1>
      <section className="card grid gap-6 p-5 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Plan actual</p>
          <p className="font-display text-4xl font-bold text-neon">{s.plan.name}</p>
          <p className="text-sm text-muted">
            {Number(s.plan.priceMonthly) === 0 ? 'Gratis' : `${formatMoney(s.plan.priceMonthly, s.plan.currency)}/mes`}
          </p>
          <dl className="mt-4 space-y-1.5 text-sm">
            <Row k="Estado" v={sub ? STATUS[sub.status] ?? sub.status : '—'} />
            <Row k="Contratado el" v={sub ? formatDate(sub.startedAt) : '—'} />
            <Row k="Próxima renovación" v={sub?.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : 'No aplica'} />
            {sub?.cancelAtPeriodEnd && <Row k="Cancelación" v="Al final del periodo" />}
          </dl>
        </div>
        <div className="space-y-4">
          <Usage label="Torneos activos" used={s.usage.activeTournaments.used} limit={s.usage.activeTournaments.limit} />
          <Usage label="Participantes por torneo (máx. usado)" used={s.usage.participantsPerTournament.used} limit={s.usage.participantsPerTournament.limit} />
          <Usage label="Administradores" used={s.usage.admins.used} limit={s.usage.admins.limit} />
        </div>
        <div className="md:col-span-2">
          <p className="label">Funcionalidades disponibles</p>
          <div className="flex flex-wrap gap-2">
            {s.plan.features.map((f) => (
              <span key={f} className="chip border-lime/40 text-lime">{FEATURE_LABEL[f] ?? f}</span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <button disabled className="btn-ghost" title="Disponible con la integración de pagos">Historial de pagos · próximamente</button>
          <button disabled className="btn-ghost" title="Disponible con la integración de pagos">Cancelar suscripción · próximamente</button>
        </div>
      </section>
      <section>
        <h2 className="mb-4 text-xl font-bold uppercase">Cambiar de plan</h2>
        <PlanCards plans={plans} current={s.plan.code} />
        <p className="mt-3 text-xs text-muted">
          El plan nunca modifica tu verificación, reputación ni posiciones en rankings.
        </p>
      </section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  );
}

function Usage({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 10;
  const full = limit !== null && used >= limit;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className={`font-semibold tabular-nums ${full ? 'text-amber' : ''}`}>
          {used} / {limit ?? '∞'}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-3">
        <div className={`h-full rounded-full ${full ? 'bg-amber' : 'bg-gradient-to-r from-neon to-neon-2'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
