'use client';

import type { ActionState } from '@/app/actions';
import { FormMessage, SubmitButton, usePersistentAction } from '@/components/forms';

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * Formulario de administración del ranking: los campos llegan como children (renderizados en el servidor)
 * y el envío conserva lo escrito si la API devuelve un error. Varios botones = varias decisiones.
 */
export function ActionForm({
  action,
  children,
  buttons,
  className = 'flex flex-wrap items-end gap-2',
}: {
  action: Action;
  children: React.ReactNode;
  buttons: { label: string; name?: string; value?: string; danger?: boolean }[];
  className?: string;
}) {
  const [state, onSubmit, pending] = usePersistentAction(action, {});
  return (
    <form method="post" onSubmit={onSubmit} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-2">
        {buttons.map((b) => (
          <SubmitButton key={b.label} pending={pending} name={b.name} value={b.value} className={b.danger ? 'btn-danger px-3 py-2 text-sm' : 'btn-primary px-3 py-2 text-sm'} pendingText="…">
            {b.label}
          </SubmitButton>
        ))}
        <FormMessage state={state} />
      </div>
    </form>
  );
}
