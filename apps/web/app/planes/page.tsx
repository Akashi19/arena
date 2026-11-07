import type { Metadata } from 'next';
import { api } from '@/lib/api';
import { PlanCards, type Plan } from '@/components/plan-cards';

export const metadata: Metadata = { title: 'Planes' };

export default async function PlansPage() {
  const plans = await api<Plan[]>('/plans', { auth: false });
  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="section-title">Planes para organizadores</h1>
        <p className="mx-auto mt-2 max-w-2xl text-muted">
          La verificación y la reputación están disponibles en todos los planes y nunca dependen de lo que pagas.
        </p>
      </div>
      <PlanCards plans={plans} />
    </div>
  );
}
