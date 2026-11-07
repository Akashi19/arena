'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, Star } from 'lucide-react';
import { requestRegistrationAction, withdrawRegistrationAction } from '@/app/actions';
import { formatMoney } from '@/lib/format';
import type { RegistrationStatus } from '@/lib/types';
import { FormMessage, SubmitButton, usePersistentAction } from './forms';

interface Props {
  tournament: {
    id: string;
    slug: string;
    name: string;
    mode: 'INDIVIDUAL' | 'TEAM';
    entryFee: string;
    currency: string;
    rules: string | null;
    refundPolicy: string | null;
    registrationOpen: boolean;
    status: string;
    organizerName: string;
    organizerVerified: boolean;
    reputationScore: string | null;
    reputationCount: number;
  };
  loggedIn: boolean;
  isOwner: boolean;
  myRegistration: { id: string; status: RegistrationStatus } | null;
  teams: { id: string; name: string; members: number }[];
}

const REG_LABEL: Record<RegistrationStatus, { text: string; cls: string }> = {
  PENDING: { text: 'Solicitud pendiente de aprobación', cls: 'border-amber/40 bg-amber/10 text-amber' },
  APPROVED: { text: '¡Estás inscrito!', cls: 'border-lime/40 bg-lime/10 text-lime' },
  REJECTED: { text: 'Tu solicitud fue rechazada', cls: 'border-danger/40 bg-danger/10 text-danger' },
  WITHDRAWN: { text: 'Retiraste tu inscripción', cls: 'border-line text-muted' },
};

/** Inscripción con pantalla de confirmación: identidad, verificación, reputación, cuota y condiciones. */
export function RegistrationPanel({ tournament: t, loggedIn, isOwner, myRegistration, teams }: Props) {
  const [state, onSubmit, pending] = usePersistentAction(requestRegistrationAction, {});
  const [withdrawState, withdrawAction] = useActionState(withdrawRegistrationAction, {});
  const [confirming, setConfirming] = useState(false);

  return (
    <section id="inscripcion" className="card scroll-mt-24 p-5">
      <h2 className="text-lg font-bold uppercase">Inscripción</h2>
      <p className="mt-1 font-display text-3xl font-bold text-neon">{formatMoney(t.entryFee, t.currency)}</p>
      <p className="text-xs text-muted">Cuota informativa fijada por el organizador. No es una apuesta.</p>

      <div className="mt-4 space-y-3">
        {myRegistration && myRegistration.status !== 'WITHDRAWN' && myRegistration.status !== 'REJECTED' ? (
          <>
            <div className={`rounded-xl border p-3 text-sm font-semibold ${REG_LABEL[myRegistration.status].cls}`}>{REG_LABEL[myRegistration.status].text}</div>
            {t.status === 'OPEN' && (
              <form action={withdrawAction}>
                <input type="hidden" name="registrationId" value={myRegistration.id} />
                <input type="hidden" name="slug" value={t.slug} />
                <SubmitButton className="btn-ghost w-full" pendingText="Retirando…">
                  Retirar inscripción
                </SubmitButton>
              </form>
            )}
            <FormMessage state={withdrawState} />
          </>
        ) : isOwner ? (
          <p className="text-sm text-muted">Eres el organizador de esta partida.</p>
        ) : !t.registrationOpen ? (
          <p className="rounded-xl border border-line bg-surface-2 p-3 text-sm text-muted">La inscripción está cerrada.</p>
        ) : !loggedIn ? (
          <Link href={`/login?next=/torneos/${t.slug}`} className="btn-primary w-full">
            Inicia sesión para inscribirte
          </Link>
        ) : state.ok ? (
          <FormMessage state={state} />
        ) : !confirming ? (
          <>
            {myRegistration?.status === 'REJECTED' && <div className={`rounded-xl border p-3 text-sm ${REG_LABEL.REJECTED.cls}`}>{REG_LABEL.REJECTED.text}. Puedes volver a solicitarla.</div>}
            <button type="button" className="btn-primary w-full" onClick={() => setConfirming(true)}>
              Solicitar inscripción
            </button>
          </>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3">
            <input type="hidden" name="tournamentId" value={t.id} />
            <input type="hidden" name="slug" value={t.slug} />
            <div className="rounded-xl border border-line bg-surface-2 p-3 text-sm">
              <p className="mb-2 font-semibold">Antes de confirmar</p>
              <ul className="space-y-1.5 text-muted">
                <li className="flex items-center gap-1.5">
                  Organiza <b className="text-ink">{t.organizerName}</b>
                  {t.organizerVerified && <BadgeCheck className="size-4 text-verified" aria-label="verificado" />}
                </li>
                <li>Verificación: {t.organizerVerified ? 'Organizador verificado' : 'No verificado'}</li>
                <li className="flex items-center gap-1">
                  Reputación:{' '}
                  {t.reputationScore ? (
                    <>
                      <Star className="size-3.5 fill-amber text-amber" /> {t.reputationScore} ({t.reputationCount} valoraciones)
                    </>
                  ) : (
                    'sin valoraciones aún'
                  )}
                </li>
                <li>Cuota: {formatMoney(t.entryFee, t.currency)}</li>
                <li>Cancelación y devolución: {t.refundPolicy || 'el organizador no especificó condiciones'}</li>
              </ul>
              <p className="mt-2 text-xs text-muted">La verificación no es una garantía absoluta de cumplimiento.</p>
            </div>
            {t.mode === 'TEAM' &&
              (teams.length ? (
                <label className="block">
                  <span className="label">Equipo a inscribir</span>
                  <select name="teamId" required className="input">
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name} ({team.members} integrantes)
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="text-sm text-amber">
                  Esta partida es por equipos y no administras ninguno.{' '}
                  <Link href="/dashboard/equipos" className="underline">Crea tu equipo</Link>.
                </p>
              ))}
            <label className="block">
              <span className="label">Mensaje al organizador (opcional)</span>
              <textarea name="notes" rows={2} maxLength={500} className="input" />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="acceptRules" required className="mt-1 accent-[var(--color-neon)]" />
              <span>He leído el reglamento, la cuota y las condiciones de cancelación de esta partida.</span>
            </label>
            <FormMessage state={state} />
            <div className="flex gap-2">
              <button type="button" className="btn-ghost flex-1" onClick={() => setConfirming(false)}>
                Volver
              </button>
              <SubmitButton pending={pending} className="btn-primary flex-1" pendingText="Enviando…">
                Confirmar
              </SubmitButton>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
