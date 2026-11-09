'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';
import { reportResultAction } from '@/app/actions';
import { FormMessage, SubmitButton, usePersistentAction } from '@/components/forms';

/** Reporte de un resultado incorrecto: lo revisa un SUPERADMIN (procedimiento de revisión del ranking). */
export function ReportResultButton({ matchId }: { matchId: string }) {
  const [open, setOpen] = useState(false);
  const [state, onSubmit, pending] = usePersistentAction(reportResultAction, {});
  if (state.ok) return <FormMessage state={state} />;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-muted hover:text-danger">
        <Flag className="size-3.5" /> Reportar resultado
      </button>
    );
  }
  return (
    <form method="post" onSubmit={onSubmit} className="flex w-full flex-wrap items-center gap-2">
      <input type="hidden" name="matchId" value={matchId} />
      <input name="reason" required minLength={10} maxLength={1000} placeholder="¿Qué está mal en este resultado?" className="input min-w-0 flex-1 py-1.5 text-sm" />
      <SubmitButton pending={pending} className="btn-danger px-3 py-1.5 text-xs" pendingText="Enviando…">
        Enviar
      </SubmitButton>
      <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setOpen(false)}>
        Cancelar
      </button>
      <FormMessage state={state} />
    </form>
  );
}
