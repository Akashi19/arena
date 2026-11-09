'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';
import { reportRatingAction } from '@/app/actions';
import { FormMessage, SubmitButton, usePersistentAction } from '@/components/forms';

export function ReportRatingButton({ ratingId }: { ratingId: string }) {
  const [open, setOpen] = useState(false);
  const [state, onSubmit, pending] = usePersistentAction(reportRatingAction, {});
  if (state.ok) return <FormMessage state={state} />;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1 text-xs text-muted hover:text-danger">
        <Flag className="size-3" /> Reportar
      </button>
    );
  }
  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="ratingId" value={ratingId} />
      <input name="reason" required minLength={5} maxLength={500} placeholder="Motivo del reporte" className="input min-w-48 flex-1 py-1.5 text-xs" />
      <SubmitButton pending={pending} className="btn-danger px-3 py-1.5 text-xs" pendingText="…">
        Enviar reporte
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
