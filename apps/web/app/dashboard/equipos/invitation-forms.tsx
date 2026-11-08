'use client';

import { useEffect, useRef } from 'react';
import { Check, Send, X } from 'lucide-react';
import { cancelInvitationAction, inviteToTeamAction, respondInvitationAction } from '@/app/actions';
import { FormMessage, SubmitButton, usePersistentAction } from '@/components/forms';

/** Invitar a un jugador con cuenta: él decide si se une (a diferencia de "agregar integrante"). */
export function InviteForm({ teamId, defaultUsername }: { teamId: string; defaultUsername?: string }) {
  const [state, onSubmit, pending] = usePersistentAction(inviteToTeamAction, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="teamId" value={teamId} />
      <div className="flex flex-wrap gap-2">
        <input
          name="username"
          required
          minLength={3}
          maxLength={30}
          defaultValue={defaultUsername}
          placeholder="Usuario del jugador"
          aria-label="Usuario del jugador a invitar"
          className="input min-w-40 flex-1"
        />
        <input name="message" maxLength={300} placeholder="Mensaje (opcional)" aria-label="Mensaje de la invitación" className="input min-w-40 flex-[2]" />
        <SubmitButton pending={pending} pendingText="Enviando…" className="btn-ghost">
          <Send className="size-4" /> Invitar
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function CancelInvitationButton({ id }: { id: string }) {
  const [state, onSubmit, pending] = usePersistentAction(cancelInvitationAction, {});
  return (
    <form onSubmit={onSubmit} className="shrink-0">
      <input type="hidden" name="id" value={id} />
      <button disabled={pending} className="text-xs text-muted hover:text-danger disabled:opacity-50">
        Cancelar
      </button>
      {state.error && <span className="ml-2 text-xs text-danger">{state.error}</span>}
    </form>
  );
}

export function RespondInvitation({ id }: { id: string }) {
  const [state, onSubmit, pending] = usePersistentAction(respondInvitationAction, {});
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button name="decision" value="accept" disabled={pending} className="btn-primary px-3 py-1.5 text-xs">
        <Check className="size-4" /> Unirme
      </button>
      <button name="decision" value="decline" disabled={pending} className="btn-ghost px-3 py-1.5 text-xs">
        <X className="size-4" /> Rechazar
      </button>
      <FormMessage state={state} />
    </form>
  );
}
