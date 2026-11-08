'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Check, Play, Flag, Rocket, Star, X } from 'lucide-react';
import { cancelTournamentAction, changeTournamentStatusAction, decideRegistrationAction, setMvpAction } from '@/app/actions';
import { flag, formatDateTime, LEVEL_LABEL, LEVEL_SOURCE_LABEL } from '@/lib/format';
import type { CompetitiveLevel, LevelVerificationType, RegistrationStatus, TournamentStatus } from '@/lib/types';
import { Avatar } from '@/components/ui';
import { FormMessage, SubmitButton, usePersistentAction } from '@/components/forms';
import { SourceIcon } from '@/components/game-profile';

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
    user: { username: string } | null;
    gameProfiles: {
      competitiveLevel: CompetitiveLevel;
      gamerTag: string;
      platform: string;
      verificationType: LevelVerificationType;
      verificationSource: string | null;
      rank: { rankName: string; rankOrder: number } | null;
    }[];
    statistics: { matchesPlayed: number; wins: number; winRate: string | number; tournamentsPlayed: number; tournamentsWon: number }[];
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
  level,
  hasGame,
}: {
  tournamentId: string;
  mode: 'INDIVIDUAL' | 'TEAM';
  status: TournamentStatus;
  registrations: ManagedRegistration[];
  filter?: RegistrationStatus;
  level?: CompetitiveLevel;
  hasGame: boolean;
}) {
  const href = (s?: RegistrationStatus, l?: CompetitiveLevel) =>
    `/dashboard/torneos/${tournamentId}?tab=inscripciones${s ? `&estado=${s}` : ''}${l ? `&nivel=${l}` : ''}`;
  const [state, action] = useActionState(decideRegistrationAction, {});
  const counts = registrations.reduce<Record<string, number>>((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {});

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-2">
        {([undefined, 'PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'] as const).map((s) => (
          <Link
            key={s ?? 'all'}
            href={href(s, level)}
            className={`chip px-3 py-1.5 ${filter === s ? 'border-neon text-neon' : ''}`}
          >
            {s ? LABEL[s] : 'Todas'} {!filter && !level && s && counts[s] ? `(${counts[s]})` : ''}
          </Link>
        ))}
      </nav>
      {mode === 'INDIVIDUAL' && hasGame && (
        <nav className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="Filtrar por nivel">
          <span className="text-muted">Nivel:</span>
          <Link href={href(filter)} className={`chip px-2.5 py-1 ${!level ? 'border-neon text-neon' : ''}`}>
            Todos
          </Link>
          {(Object.keys(LEVEL_LABEL) as CompetitiveLevel[]).map((l) => (
            <Link key={l} href={href(filter, l)} className={`chip px-2.5 py-1 ${level === l ? 'border-neon text-neon' : ''}`}>
              {LEVEL_LABEL[l]}
            </Link>
          ))}
        </nav>
      )}
      <FormMessage state={state} />
      {registrations.length ? (
        <ul className="space-y-2">
          {registrations.map((r) => {
            const name = r.team?.name ?? r.player?.nickname ?? '—';
            const profile = r.player?.gameProfiles[0];
            const stats = r.player?.statistics[0];
            return (
              <li key={r.id} className="card flex flex-wrap items-center gap-3 p-3">
                <Avatar src={r.team?.logoUrl ?? r.player?.avatarUrl} name={name} size={42} rounded={mode === 'TEAM' ? 'xl' : 'full'} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {r.team ? (
                      <Link href={`/equipos/${r.team.slug}`} className="hover:text-neon">{name}</Link>
                    ) : r.player?.user ? (
                      <Link href={`/jugadores/${r.player.user.username}`} className="hover:text-neon">{name}</Link>
                    ) : (
                      name
                    )}{' '}
                    <span className="text-sm">{flag(r.team?.country ?? r.player?.country)}</span>
                  </p>
                  <p className="text-xs text-muted">
                    {r.team ? `${r.team._count.members} integrantes · ` : `${r.player?.fullName} · `}
                    @{r.requestedBy.username} · {formatDateTime(r.createdAt)}
                  </p>
                  {profile && (
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs">
                      <span className="font-mono">{profile.gamerTag}</span> ·
                      <span className="inline-flex items-center gap-1 font-semibold" title={profile.verificationSource ?? LEVEL_SOURCE_LABEL[profile.verificationType]}>
                        {LEVEL_LABEL[profile.competitiveLevel]}
                        {profile.verificationType === 'SELF_DECLARED' ? <span className="font-normal text-muted">(declarado)</span> : <SourceIcon type={profile.verificationType} />}
                      </span>
                      {profile.rank && <>· {profile.rank.rankName}</>}
                      {stats && (
                        <span className="text-muted">
                          · {stats.matchesPlayed} PJ · {Number(stats.winRate).toFixed(0)}% V · {stats.tournamentsWon} {stats.tournamentsWon === 1 ? 'título' : 'títulos'}
                        </span>
                      )}
                    </p>
                  )}
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

/** Jugador destacado (MVP): solo con la partida finalizada; genera el logro correspondiente. */
export function MvpForm({
  tournamentId,
  slug,
  current,
  candidates,
}: {
  tournamentId: string;
  slug: string;
  current: string | null;
  candidates: { id: string; label: string }[];
}) {
  const [state, onSubmit, pending] = usePersistentAction(setMvpAction, {});
  return (
    <form onSubmit={onSubmit} className="card space-y-2 p-4">
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="slug" value={slug} />
      <label className="block">
        <span className="label flex items-center gap-1.5">
          <Star className="size-3.5 text-amber" /> Jugador destacado
        </span>
        <div className="flex flex-wrap gap-2">
          <select name="playerId" defaultValue={current ?? ''} className="input min-w-48 flex-1">
            <option value="">Sin jugador destacado</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <SubmitButton pending={pending} className="btn-ghost">
            Guardar
          </SubmitButton>
        </div>
      </label>
      <p className="text-xs text-muted">Otorga el logro “Jugador destacado” en su perfil. Si cambias la elección, se retira al anterior.</p>
      <FormMessage state={state} />
    </form>
  );
}
