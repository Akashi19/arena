import type { Metadata } from 'next';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { requireOrganizer } from '@/lib/session';
import type { Discipline } from '@/lib/types';
import { TournamentForm } from '@/components/tournament-form';

export const metadata: Metadata = { title: 'Crear partida' };

interface Usage {
  plan: { name: string };
  usage: { activeTournaments: { used: number; limit: number | null }; participantsPerTournament: { limit: number } };
}

export default async function NewTournamentPage() {
  await requireOrganizer('/dashboard/torneos/nuevo');
  const [sports, games, sub] = await Promise.all([
    api<Discipline[]>('/sports', { auth: false }),
    api<(Discipline & { platforms: string[] })[]>('/games', { auth: false }),
    api<Usage>('/me/subscription'),
  ]);
  const { used, limit } = sub.usage.activeTournaments;
  const atLimit = limit !== null && used >= limit;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="section-title">Crear partida</h1>
        <p className="text-sm text-muted">Tu logo de organizador se mostrará automáticamente en la partida.</p>
      </div>
      {atLimit && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber/50 bg-amber/10 p-4 text-sm text-amber">
          <Sparkles className="mt-0.5 size-5 shrink-0" />
          <p>
            Has alcanzado el límite de {limit} torneos activos de tu plan {sub.plan.name}. Puedes finalizar o cancelar una partida, o{' '}
            <Link href="/dashboard/suscripcion" className="font-semibold underline">actualizar tu suscripción</Link>.
          </p>
        </div>
      )}
      <TournamentForm sports={sports} games={games} maxParticipantsLimit={sub.usage.participantsPerTournament.limit} />
    </div>
  );
}
