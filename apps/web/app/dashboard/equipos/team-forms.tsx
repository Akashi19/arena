'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Crown, Plus, Trash2, UserMinus } from 'lucide-react';
import { addTeamMemberAction, createTeamAction, deleteTeamAction, removeTeamMemberAction, setCaptainAction } from '@/app/actions';
import { COUNTRIES } from '@/lib/format';
import type { Discipline } from '@/lib/types';
import { FormMessage, ImageField, SubmitButton, usePersistentAction } from '@/components/forms';

export function CreateTeamForm({ sports, games }: { sports: Discipline[]; games: Discipline[] }) {
  const [state, onSubmit, pending] = usePersistentAction(createTeamAction, {});
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state]);

  if (!open) {
    return (
      <div className="space-y-2">
        <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Nuevo equipo
        </button>
        <FormMessage state={state} />
      </div>
    );
  }
  return (
    <form ref={formRef} onSubmit={onSubmit} className="card space-y-4 p-5">
      <h2 className="text-lg font-bold uppercase">Nuevo equipo</h2>
      <div className="flex flex-col gap-4 sm:flex-row">
        <ImageField name="logo" label="Escudo" />
        <div className="grid flex-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Nombre *</span>
            <input name="name" required minLength={2} maxLength={60} className="input" />
          </label>
          <label className="block">
            <span className="label">Tag (2-6)</span>
            <input name="tag" pattern="[A-Za-z0-9]{2,6}" className="input uppercase" />
          </label>
          <label className="block">
            <span className="label">Disciplina</span>
            <select name="discipline" className="input">
              <option value="">Multidisciplina</option>
              <optgroup label="Videojuegos">
                {games.map((g) => <option key={g.id} value={`game:${g.id}`}>{g.name}</option>)}
              </optgroup>
              <optgroup label="Deportes">
                {sports.map((s) => <option key={s.id} value={`sport:${s.id}`}>{s.name}</option>)}
              </optgroup>
            </select>
          </label>
          <label className="block">
            <span className="label">País</span>
            <select name="country" className="input">
              <option value="">Internacional</option>
              {Object.entries(COUNTRIES).map(([c, n]) => <option key={c} value={c}>{n}</option>)}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="label">Descripción</span>
            <textarea name="description" rows={2} maxLength={1000} className="input" />
          </label>
        </div>
      </div>
      <FormMessage state={state} />
      <div className="flex gap-2">
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
        <SubmitButton pending={pending} pendingText="Creando…">Crear equipo</SubmitButton>
      </div>
    </form>
  );
}

export function AddMemberForm({ teamId }: { teamId: string }) {
  const [state, action] = useActionState(addTeamMemberAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} action={action} className="mt-4 space-y-2 border-t border-line pt-4">
      <input type="hidden" name="teamId" value={teamId} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <input name="username" required placeholder="Usuario del jugador" className="input sm:flex-1" />
        <input name="role" placeholder="Posición / rol" className="input sm:w-40" />
        <input name="jerseyNumber" type="number" min={0} max={99} placeholder="N.º" className="input sm:w-20" />
        <SubmitButton className="btn-ghost" pendingText="…">
          <Plus className="size-4" /> Agregar
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function MemberActions({ teamId, playerId, isCaptain }: { teamId: string; playerId: string; isCaptain: boolean }) {
  const [, captainAction] = useActionState(setCaptainAction, {});
  const [removeState, removeAction] = useActionState(removeTeamMemberAction, {});
  return (
    <div className="flex gap-1">
      {!isCaptain && (
        <form action={captainAction}>
          <input type="hidden" name="teamId" value={teamId} />
          <input type="hidden" name="playerId" value={playerId} />
          <button className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-3 hover:text-amber" title="Nombrar capitán" aria-label="Nombrar capitán">
            <Crown className="size-4" />
          </button>
        </form>
      )}
      <form action={removeAction}>
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="playerId" value={playerId} />
        <button className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-3 hover:text-danger" title="Retirar del equipo" aria-label="Retirar del equipo">
          <UserMinus className="size-4" />
        </button>
      </form>
      {removeState.error && <span className="text-xs text-danger">{removeState.error}</span>}
    </div>
  );
}

export function DeleteTeamButton({ teamId }: { teamId: string }) {
  const [state, action] = useActionState(deleteTeamAction, {});
  const [confirm, setConfirm] = useState(false);
  return confirm ? (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="teamId" value={teamId} />
      <span className="text-xs text-muted">¿Eliminar? Si ya compitió se archivará.</span>
      <SubmitButton className="btn-danger px-3 py-1.5 text-xs" pendingText="…">Sí, eliminar</SubmitButton>
      <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setConfirm(false)}>No</button>
      <FormMessage state={state} />
    </form>
  ) : (
    <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={() => setConfirm(true)}>
      <Trash2 className="size-4" /> Eliminar
    </button>
  );
}
