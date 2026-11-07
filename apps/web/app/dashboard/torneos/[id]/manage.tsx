'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Check, Play, Flag, Rocket, X } from 'lucide-react';
import { cancelTournamentAction, changeTournamentStatusAction, decideRegistrationAction } from '@/app/actions';
import { flag, formatDateTime, LEVEL_LABEL } from '@/lib/format';
import type { CompetitiveLevel, RegistrationStatus, TournamentStatus } from '@/lib/types';
import { Avatar } from '@/components/ui';
import { FormMessage, SubmitButton } from '@/components/forms';

export interface ManagedRegistration {
  id: string;
  status: RegistrationStatus;
  createdAt: string;
  notes: string | null;
  requestedBy: { username: string };
  team: { id: string; name: string; slug: string; logoUrl: string | null; country: string | null; _count: { members: number } } | null;
  player: {
    id: string;
    nickname: string;
    fullName: string;
    avatarUrl: string | null;
    country: string | null;
    gameProfiles: { competitiveLevel: CompetitiveLevel; gamerTag: string; platform: string; verificationType: string }[];
  } | null;
}

const LABEL: Record<RegistrationStatus, string> = { PENDING: 'Pendiente', APPROVED: 'Aprobada', REJECTED: 'Rechazada', WITHDRAWN: 'Retirada' };
const COLOR: Record<RegistrationStatus, string> = {
  PENDING: 'text-amber',
  APPROVED: 'text-lime',
  REJECTED: 'text-danger',
  WITHDRAWN: 'text-muted',
};

export function StatusActions({ id, status }: { id: string; status: TournamentStatus }) {
  const [state, action] = useActionState(changeTournamentStatusAction, {});
  const [cancelState, cancelAction] = useActionState(cancelTournamentAction, {});
  const [cancelling, setCancelling] = useState(false);
  const next: { status: TournamentStatus; label: string; icon: React.ReactNode } | null =
    status === 'DRAFT'
      ? { status: 'OPEN', label: 'Publicar', icon: <Rocket className="size-4" /> }
      : status === 'OPEN'
        ? { status: 'IN_PROGRESS', label: 'Iniciar partida', icon: <Play className="size-4" /> }
        : status === 'IN_PROGRESS'
          ? { status: 'FINISHED', label: 'Finalizar', icon: <Flag className="size-4" /> }
          : null;
  if (!next) return null;

  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <form action={action}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value={next.status} />
          <SubmitButton pendingText="Actualizando…">
            {next.icon} {next.label}
          </SubmitButton>
        </form>
        <button type="button" className="btn-danger" onClick={() => setCancelling((c) => !c)}>
          Cancelar partida
        </button>
      </div>
      <FormMessage state={state} />
      {cancelling && (
        <form action={cancelAction} className="space-y-2 rounded-xl border border-danger/40 bg-danger/5 p-3">
          <input type="hidden" name="id" value={id} />
          <label className="block">
            <span className="label">Motivo de la cancelación (se notifica a los inscritos)</span>
            <textarea name="reason" required minLength={5} maxLength={500} rows={2} className="input" />
          </label>
          <SubmitButton className="btn-danger" pendingText="Cancelando…">
            Confirmar cancelación
          </SubmitButton>
        </form>
      )}
      <FormMessage state={cancelState} />
    </div>
  );
}

export function RegistrationsManager({
  tournamentId,
  mode,
  status,
  registrations,
  filter,
}: {
  tournamentId: string;
  mode: 'INDIVIDUAL' | 'TEAM';
  status: TournamentStatus;
  registrations: ManagedRegistration[];
  filter?: RegistrationStatus;
}) {
  const [state, action] = useActionState(decideRegistrationAction, {});
  const counts = registrations.reduce<Record<string, number>>((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {});

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2">
        {([undefined, 'PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'] as const).map((s) => (
          <Link
            key={s ?? 'all'}
            href={`/dashboard/torneos/${tournamentId}?tab=inscripciones${s ? `&estado=${s}` : ''}`}
            className={`chip px-3 py-1.5 ${filter === s ? 'border-neon text-neon' : ''}`}
          >
            {s ? LABEL[s] : 'Todas'} {!filter && s && counts[s] ? `(${counts[s]})` : ''}
          </Link>
        ))}
      </nav>
      <FormMessage state={state} />
      {registrations.length ? (
        <ul className="space-y-2">
          {registrations.map((r) => {
            const name = r.team?.name ?? r.player?.nickname ?? '—';
            const profile = r.player?.gameProfiles[0];
            return (
              <li key={r.id} className="card flex flex-wrap items-center gap-3 p-3">
                <Avatar src={r.team?.logoUrl ?? r.player?.avatarUrl} name={name} size={42} rounded={mode === 'TEAM' ? 'xl' : 'full'} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {r.team ? <Link href={`/equipos/${r.team.slug}`} className="hover:text-neon">{name}</Link> : name}{' '}
                    <span className="text-sm">{flag(r.team?.country ?? r.player?.country)}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {r.team ? `${r.team._count.members} integrantes · ` : `${r.player?.fullName} · `}
                    @{r.requestedBy.username} · {formatDateTime(r.createdAt)}
                    {profile && ` · ${profile.gamerTag} · ${LEVEL_LABEL[profile.competitiveLevel]}${profile.verificationType === 'SELF_DECLARED' ? ' (declarado)' : ''}`}
                  </p>
                  {r.notes && <p className="mt-1 text-xs italic text-muted">“{r.notes}”</p>}
                </div>
                <span className={`text-sm font-semibold ${COLOR[r.status]}`}>{LABEL[r.status]}</span>
                {status === 'OPEN' && (r.status === 'PENDING' || r.status === 'REJECTED' || r.status === 'APPROVED') && (
                  <form action={action} className="flex gap-1.5">
                    <input type="hidden" name="registrationId" value={r.id} />
                    <input type="hidden" name="tournamentId" value={tournamentId} />
                    {r.status !== 'APPROVED' && (
                      <SubmitButton name="status" value="APPROVED" className="btn-primary px-3 py-1.5 text-xs" pendingText="…">
                        <Check className="size-4" /> Aprobar
                      </SubmitButton>
                    )}
                    {r.status !== 'REJECTED' && (
                      <SubmitButton name="status" value="REJECTED" className="btn-danger px-3 py-1.5 text-xs" pendingText="…">
                        <X className="size-4" /> Rechazar
                      </SubmitButton>
                    )}
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="card p-6 text-center text-sm text-muted">No hay inscripciones {filter ? `con estado “${LABEL[filter]}”` : 'todavía'}.</p>
      )}
    </div>
  );
}
