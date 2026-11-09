import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, CalendarClock, History, Hourglass, Receipt } from 'lucide-react';
import { api } from '@/lib/api';
import { requireOrganizer } from '@/lib/session';
import { formatAmount, formatDate, formatMoney, PERIOD_LABEL, PROVIDER_LABEL, SUBSCRIPTION_STATUS_LABEL } from '@/lib/format';
import type { SubscriptionSummary } from '@/lib/types';
import { FEATURE_LABEL, type Plan } from '@/components/plan-cards';
import { PlanChooser } from './plan-chooser';
import { CancelSubscription, ResumeSubscription, StartTrial } from './manage';

export const metadata: Metadata = { title: 'Mi suscripción' };

export default async function SubscriptionPage() {
  await requireOrganizer('/dashboard/suscripcion');
  const [s, plans] = await Promise.all([api<SubscriptionSummary>('/me/subscription'), api<Plan[]>('/plans', { auth: false })]);
  const sub = s.subscription;
  const paid = sub && !sub.isFree;
  const price = sub && paid ? (sub.billingPeriod === 'YEARLY' ? sub.plan.priceYearly : sub.plan.priceMonthly) : '0';
  const trialPlan = plans.find((p) => p.code === 'PRO' && p.trialDays > 0) ?? plans.find((p) => p.trialDays > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="section-title mr-auto">Mi suscripción</h1>
        <Link href="/dashboard/suscripcion/historial" className="btn-ghost px-3 py-1.5 text-sm">
          <Receipt className="size-4" /> Historial de pagos
        </Link>
      </div>

      {sub?.status === 'PAST_DUE' && (
        <Banner tone="danger" icon={<AlertTriangle className="size-5" />}>
          <p className="font-semibold">Pago de renovación pendiente</p>
          <p className="text-sm">
            Tu periodo terminó el {sub.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : '—'}.
            {sub.graceUntil && ` Conservas tu plan ${sub.plan.name} hasta el ${formatDate(sub.graceUntil)}; después pasarás a Free.`} Elige tu plan abajo y paga la renovación.
          </p>
        </Banner>
      )}
      {sub?.status === 'TRIAL' && sub.trialEndsAt && (
        <Banner tone="info" icon={<Hourglass className="size-5" />}>
          <p className="font-semibold">Prueba gratuita de {sub.plan.name}</p>
          <p className="text-sm">Termina el {formatDate(sub.trialEndsAt)}. Contrata el plan antes de esa fecha para conservar sus funcionalidades.</p>
        </Banner>
      )}
      {sub?.cancelAtPeriodEnd && sub.currentPeriodEnd && (
        <Banner tone="warn" icon={<CalendarClock className="size-5" />}>
          <div className="flex flex-wrap items-center gap-3">
            <p className="mr-auto text-sm">
              Cancelaste tu suscripción: conservas {sub.plan.name} hasta el {formatDate(sub.currentPeriodEnd)} y luego pasarás a Free.
            </p>
            <ResumeSubscription label="Mantener mi plan" />
          </div>
        </Banner>
      )}
      {sub?.pendingPlan && sub.currentPeriodEnd && (
        <Banner tone="warn" icon={<CalendarClock className="size-5" />}>
          <div className="flex flex-wrap items-center gap-3">
            <p className="mr-auto text-sm">
              El {formatDate(sub.currentPeriodEnd)} tu plan cambiará a {sub.pendingPlan.name}
              {sub.pendingBillingPeriod && ` (${PERIOD_LABEL[sub.pendingBillingPeriod].toLowerCase()})`} y deberás pagar el nuevo periodo.
            </p>
            <ResumeSubscription label="Anular el cambio" />
          </div>
        </Banner>
      )}
      {s.pendingPayment && (
        <Banner tone="info" icon={<Receipt className="size-5" />}>
          <div className="flex flex-wrap items-center gap-3">
            <p className="mr-auto text-sm">
              Tienes un pago sin completar de {formatAmount(s.pendingPayment.amount, s.pendingPayment.currency)} por {s.pendingPayment.plan.name} (
              {PROVIDER_LABEL[s.pendingPayment.provider]}).
            </p>
            <Link href={`/dashboard/suscripcion/pago/${s.pendingPayment.id}`} className="btn-primary px-3 py-1.5 text-sm">
              Continuar el pago
            </Link>
          </div>
        </Banner>
      )}

      <section className="card grid gap-6 p-5 md:grid-cols-2" aria-labelledby="current-plan">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Plan actual</p>
          <p id="current-plan" className="font-display text-4xl font-bold text-neon">
            {s.plan.name}
          </p>
          <p className="text-sm text-muted">
            {paid ? `${formatMoney(price, sub!.plan.currency)} / ${sub!.billingPeriod === 'YEARLY' ? 'año' : 'mes'}` : sub?.status === 'TRIAL' ? 'Prueba sin costo' : 'Gratis'}
          </p>
          <dl className="mt-4 space-y-1.5 text-sm">
            <Row k="Estado" v={sub ? SUBSCRIPTION_STATUS_LABEL[sub.status] ?? sub.status : '—'} />
            {paid && <Row k="Facturación" v={PERIOD_LABEL[sub!.billingPeriod]} />}
            <Row k="Contratado el" v={sub ? formatDate(sub.startedAt) : '—'} />
            <Row
              k={sub?.cancelAtPeriodEnd ? 'Termina el' : sub?.status === 'TRIAL' ? 'Fin de la prueba' : 'Próxima renovación'}
              v={sub?.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : 'No aplica'}
            />
            {paid && sub?.provider && <Row k="Medio de pago" v={PROVIDER_LABEL[sub.provider] ?? sub.provider} />}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {s.trialAvailable && trialPlan && <StartTrial planCode={trialPlan.code} planName={trialPlan.name} days={trialPlan.trialDays} />}
            {sub && !sub.isFree && !sub.cancelAtPeriodEnd && <CancelSubscription immediate={sub.status !== 'ACTIVE'} />}
          </div>
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
              <span key={f} className="chip border-lime/40 text-lime">
                {FEATURE_LABEL[f] ?? f}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="cambiar" aria-labelledby="change-plan" className="scroll-mt-24">
        <h2 id="change-plan" className="mb-4 text-xl font-bold uppercase">
          {sub?.status === 'PAST_DUE' ? 'Renovar o cambiar de plan' : 'Mejorar o cambiar de plan'}
        </h2>
        <PlanChooser plans={plans} currentCode={sub?.plan.code ?? s.plan.code} currentPeriod={sub?.billingPeriod ?? 'MONTHLY'} providers={s.providers} />
      </section>

      <p className="flex items-center gap-2 text-xs text-muted">
        <History className="size-3.5" aria-hidden /> Cada cambio de tu suscripción queda registrado en el{' '}
        <Link href="/dashboard/suscripcion/historial" className="underline underline-offset-2 hover:text-ink">
          historial
        </Link>
        .
      </p>
    </div>
  );
}

function Banner({ tone, icon, children }: { tone: 'danger' | 'warn' | 'info'; icon: React.ReactNode; children: React.ReactNode }) {
  const cls = { danger: 'border-danger/50 bg-danger/10', warn: 'border-amber/50 bg-amber/10', info: 'border-neon/40 bg-neon/5' }[tone];
  const ic = { danger: 'text-danger', warn: 'text-amber', info: 'text-neon' }[tone];
  return (
    <div className={`flex gap-3 rounded-2xl border p-4 ${cls}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <span className={`mt-0.5 shrink-0 ${ic}`} aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right font-semibold">{v}</dd>
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
      <div className="h-2 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-label={label} aria-valuenow={used} aria-valuemin={0} aria-valuemax={limit ?? undefined}>
        <div className={`h-full rounded-full ${full ? 'bg-amber' : 'bg-gradient-to-r from-neon to-neon-2'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
