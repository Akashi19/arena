import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';
import { requireOrganizer } from '@/lib/session';
import type { MyReputation } from '@/lib/types';
import { IncidentList, RatingCard, ReputationOverview } from '@/components/trust';
import { ResponseForm } from './response-form';

export const metadata: Metadata = { title: 'Reputación' };

export default async function ReputationPage() {
  const me = await requireOrganizer('/dashboard/reputacion');
  const rep = await api<MyReputation>('/me/reputation');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="section-title">Reputación</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Se calcula con las valoraciones de participantes de torneos finalizados y tu historial de cumplimiento. Es igual
            para todos los planes y no puede modificarse manualmente.
          </p>
        </div>
        <Link href={`/organizer/${me.username}/trust`} className="text-sm text-neon hover:underline">
          Ver mi centro de confianza público
        </Link>
      </div>

      <ReputationOverview summary={rep} />

      <section className="space-y-3">
        <h2 className="text-xl font-bold uppercase">
          Comentarios recientes{' '}
          {rep.pendingResponses > 0 && <span className="chip ml-2 border-amber/40 text-amber">{rep.pendingResponses} sin responder</span>}
        </h2>
        {rep.recent.length ? (
          <div className="space-y-3">
            {rep.recent.map((r) => (
              <RatingCard key={r.id} rating={r}>
                {(!r.response || (r.response.editableUntil && new Date(r.response.editableUntil) > new Date())) && (
                  <ResponseForm ratingId={r.id} current={r.response?.response} />
                )}
              </RatingCard>
            ))}
          </div>
        ) : (
          <p className="card p-5 text-sm text-muted">Todavía no recibiste valoraciones. Los participantes pueden valorarte cuando finaliza una partida.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold uppercase">Incidencias confirmadas</h2>
        {rep.openIncidents > 0 && (
          <p className="text-sm text-muted">
            Hay {rep.openIncidents} {rep.openIncidents === 1 ? 'incidencia' : 'incidencias'} en revisión. Solo las confirmadas por el equipo de la
            plataforma afectan tus indicadores.
          </p>
        )}
        <IncidentList incidents={rep.confirmedIncidents} />
      </section>
    </div>
  );
}
