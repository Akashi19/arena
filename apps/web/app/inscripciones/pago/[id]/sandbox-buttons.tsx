'use client';

import { registrationSandboxAction } from '@/app/actions';
import { FormMessage, SubmitButton, usePersistentAction } from '@/components/forms';

/** Pago de prueba (sin dinero real): solo existe con BILLING_SANDBOX. */
export function SandboxButtons({ paymentId }: { paymentId: string }) {
  const [state, onSubmit, pending] = usePersistentAction(registrationSandboxAction, {});
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-3 rounded-xl border border-dashed border-amber/50 p-4">
      <input type="hidden" name="paymentId" value={paymentId} />
      <p className="text-sm">
        <b className="text-amber">Pago de prueba.</b> No se mueve dinero real: elige el resultado que devolvería Mercado Pago.
      </p>
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={pending} name="approve" value="true" pendingText="Procesando…">
          Aprobar pago
        </SubmitButton>
        <SubmitButton pending={pending} name="approve" value="false" className="btn-ghost" pendingText="Procesando…">
          Rechazar pago
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
