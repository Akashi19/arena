'use client';

import { useState } from 'react';
import { respondRatingAction } from '@/app/actions';
import { FormMessage, SubmitButton, usePersistentAction } from '@/components/forms';

export function ResponseForm({ ratingId, current }: { ratingId: string; current?: string }) {
  const [open, setOpen] = useState(false);
  const [state, onSubmit, pending] = usePersistentAction(respondRatingAction, {});
  if (!open) {
    return (
      <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setOpen(true)}>
        {current ? 'Editar respuesta' : 'Responder públicamente'}
      </button>
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="ratingId" value={ratingId} />
      {current && <input type="hidden" name="edit" value="1" />}
      <textarea name="response" defaultValue={current} required minLength={2} maxLength={1000} rows={3} className="input" placeholder="Responde con respeto: tu respuesta es pública." />
      <p className="text-xs text-muted">Una respuesta por valoración, editable durante 7 días. Los comentarios legítimos no se eliminan por ser negativos.</p>
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pending={pending} className="btn-primary px-3 py-1.5 text-xs" pendingText="…">
          Publicar respuesta
        </SubmitButton>
        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setOpen(false)}>
          Cancelar
        </button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
