import Link from 'next/link';
import { Check } from 'lucide-react';
import { formatMoney } from '@/lib/format';

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceMonthly: string;
  priceYearly: string;
  currency: string;
  maxActiveTournaments: number | null;
  maxParticipantsPerTournament: number;
  maxAdmins: number;
  trialDays: number;
  features: { featureKey: string }[];
}

export const FEATURE_LABEL: Record<string, string> = {
  BASIC_STATS: 'Estadísticas básicas',
  ADVANCED_STATS: 'Estadísticas avanzadas',
  BASIC_CUSTOMIZATION: 'Personalización básica (logo y descripción)',
  FULL_CUSTOMIZATION: 'Personalización completa (color de marca y banner)',
  ADVANCED_BRANDING: 'Branding avanzado',
  CUSTOM_DOMAIN: 'Dominio personalizado',
  MULTIPLE_ADMINS: 'Múltiples administradores',
  EXECUTIVE_REPORTS: 'Reportes ejecutivos',
  AUDIT_LOG: 'Auditoría',
  EXPORT_REPORTS: 'Exportación de reportes',
  VERIFICATION: 'Verificación de organizador',
  REPUTATION: 'Sistema de reputación',
};

export function PlanCards({ plans, current }: { plans: Plan[]; current?: string }) {
  return (
    <div className={`grid gap-5 ${plans.length > 3 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3'}`}>
      {plans.map((p) => {
        const highlight = p.code === 'PRO';
        return (
          <div key={p.id} className={`card relative flex flex-col p-6 ${highlight ? 'border-neon/60 shadow-neon' : ''}`}>
            {highlight && <span className="absolute -top-3 left-6 rounded-full bg-neon px-3 py-0.5 text-xs font-bold text-bg">Más popular</span>}
            <h3 className="text-2xl font-bold uppercase">{p.name}</h3>
            <p className="mt-1 min-h-10 text-sm text-muted">{p.description}</p>
            <p className="mt-4 font-display text-4xl font-bold">
              {Number(p.priceMonthly) === 0 ? 'Gratis' : formatMoney(p.priceMonthly, p.currency)}
              {Number(p.priceMonthly) > 0 && <span className="text-base font-medium text-muted">/mes</span>}
            </p>
            {Number(p.priceYearly) > 0 && <p className="text-xs text-muted">o {formatMoney(p.priceYearly, p.currency)} al año</p>}
            <ul className="mt-5 space-y-2 text-sm">
              <li className="flex gap-2">
                <Check className="size-4 shrink-0 text-lime" />
                {p.maxActiveTournaments === null ? 'Torneos activos ilimitados (uso razonable)' : `${p.maxActiveTournaments} torneos activos`}
              </li>
              <li className="flex gap-2">
                <Check className="size-4 shrink-0 text-lime" /> {p.maxParticipantsPerTournament} participantes por torneo
              </li>
              <li className="flex gap-2">
                <Check className="size-4 shrink-0 text-lime" /> {p.maxAdmins === 1 ? 'Un administrador' : `Hasta ${p.maxAdmins} administradores`}
              </li>
              {p.features.map((f) => (
                <li key={f.featureKey} className="flex gap-2">
                  <Check className="size-4 shrink-0 text-lime" /> {FEATURE_LABEL[f.featureKey] ?? f.featureKey}
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-6">
              {current === p.code ? (
                <span className="btn-ghost w-full cursor-default">Tu plan actual</span>
              ) : current ? (
                <Link href="/dashboard/suscripcion#cambiar" className={highlight ? 'btn-primary w-full' : 'btn-ghost w-full'}>
                  {Number(p.priceMonthly) === 0 ? 'Cambiar a Free' : `Elegir ${p.name}`}
                </Link>
              ) : (
                <Link href="/registro" className={highlight ? 'btn-primary w-full' : 'btn-ghost w-full'}>
                  Empezar
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

