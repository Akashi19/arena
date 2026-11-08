import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { ReputationSummary } from '@/lib/types';
import { REPUTATION_LABEL } from '@/lib/format';
import { MonthlyChart } from '@/components/trust';

export const metadata: Metadata = { title: 'Confianza' };

interface TrustDashboard {
  verification: Record<string, number>;
  reputationLevels: Record<string, number>;
  ratings: { total: number; suspicious: number; pendingModeration: number };
  incidents: Record<string, number>;
  monthly: ReputationSummary['monthly'];
}

export default async function AdminHome() {
  const d = await api<TrustDashboard>('/admin/trust');
  const v = (k: string) => d.verification[k] ?? 0;
  const i = (k: string) => d.incidents[k] ?? 0;
  const levels = ['NEW', 'INITIAL', 'GOOD', 'EXCELLENT', 'TOP'] as const;
  const totalLevels = levels.reduce((s, l) => s + (d.reputationLevels[l] ?? 0), 0);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Organizadores verificados" value={v('VERIFIED')} href="/admin/verificaciones?status=VERIFIED" />
        <Kpi label="Solicitudes pendientes" value={v('PENDING') + v('UNDER_REVIEW')} href="/admin/verificaciones?status=PENDING" accent="text-amber" />
        <Kpi label="Verificaciones suspendidas" value={v('SUSPENDED')} href="/admin/verificaciones?status=SUSPENDED" accent="text-danger" />
        <Kpi label="Valoraciones recibidas" value={d.ratings.total} href="/admin/valoraciones" />
        <Kpi label="Valoraciones sospechosas" value={d.ratings.suspicious} href="/admin/valoraciones?filtro=sospechosas" accent="text-danger" />
        <Kpi label="Pendientes de moderación" value={d.ratings.pendingModeration} href="/admin/valoraciones?filtro=pendientes" accent="text-amber" />
        <Kpi label="Incidencias abiertas" value={i('OPEN') + i('UNDER_REVIEW')} href="/admin/incidencias" accent="text-amber" />
        <Kpi label="Incidencias confirmadas" value={i('RESOLVED')} href="/admin/incidencias?status=RESOLVED" />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card space-y-2 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Distribución de reputaciones</p>
          {levels.map((l) => {
            const n = d.reputationLevels[l] ?? 0;
            return (
              <div key={l} className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-2 text-sm">
                <span>{REPUTATION_LABEL[l]}</span>
                <span className="h-2 overflow-hidden rounded-full bg-surface-3">
                  <span className="block h-full rounded-full bg-neon" style={{ width: `${totalLevels ? (n / totalLevels) * 100 : 0}%` }} />
                </span>
                <span className="text-right tabular-nums text-muted">{n}</span>
              </div>
            );
          })}
        </section>
        <MonthlyChart monthly={d.monthly} />
      </div>
    </div>
  );
}

function Kpi({ label, value, href, accent = '' }: { label: string; value: number; href: string; accent?: string }) {
  return (
    <Link href={href} className="card p-4 transition hover:border-neon/50">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className={`font-display text-3xl font-bold tabular-nums ${accent}`}>{value}</p>
    </Link>
  );
}
