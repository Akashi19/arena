'use client';

import { useState } from 'react';
import { cancelSubscriptionAction, resumeSubscriptionAction, sandboxPaymentAction, startTrialAction } from '@/app/actions';
import { FormMessage, SubmitButton, usePersistentAction } from '@/components/forms';

export function CancelSubscription({ immediate }: { immediate: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, onSubmit, pending] = usePersistentAction(cancelSubscriptionAction, {});
  if (!open)
    return (
      <div className="space-y-2">
        <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>
          Cancelar suscripción
        </button>
        <FormMessage state={state} />
      </div>
    );
  return (
    <form method="post" onSubmit={onSubmit} className="w-full space-y-2 rounded-xl border border-danger/40 p-4">
      <p className="text-sm">
        {immediate
          ? 'Tu suscripción no tiene un periodo pagado vigente: pasarás al plan Free de inmediato.'
          : 'Conservarás tu plan hasta el final del periodo pagado y luego pasarás a Free. No se hacen cobros adicionales.'}
      </p>
      <label className="block">
        <span className="label">¿Por qué cancelas? (opcional)</span>
        <input name="reason" maxLength={500} className="input" />
      </label>
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={pending} className="btn-danger" pendingText="Cancelando…">
          Confirmar cancelación
        </SubmitButton>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Volver
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function ResumeSubscription({ label }: { label: string }) {
  const [state, onSubmit, pending] = usePersistentAction(resumeSubscriptionAction, {});
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-2">
      <SubmitButton pending={pending} className="btn-primary px-3 py-1.5 text-sm" pendingText="…">
        {label}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function StartTrial({ planCode, planName, days }: { planCode: string; planName: string; days: number }) {
  const [state, onSubmit, pending] = usePersistentAction(startTrialAction, {});
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="planCode" value={planCode} />
      <SubmitButton pending={pending} className="btn-ghost px-3 py-1.5 text-sm" pendingText="Activando…">
        Probar {planName} gratis {days} días
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

/** Pago simulado: recorre el mismo flujo que la confirmación de un proveedor real. */
export function SandboxPayment({ paymentId }: { paymentId: string }) {
  const [state, onSubmit, pending] = usePersistentAction(sandboxPaymentAction, {});
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="paymentId" value={paymentId} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="outcome" value="SUCCEEDED" pending={pending} className="btn-primary" pendingText="Procesando…">
          Aprobar pago de prueba
        </SubmitButton>
        <SubmitButton name="outcome" value="FAILED" pending={pending} className="btn-ghost" pendingText="…">
          Simular rechazo
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
