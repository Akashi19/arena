'use client';

import { useState } from 'react';
import { connectSandboxAccountAction, disconnectPaymentAccountAction, refundRegistrationPaymentAction } from '@/app/actions';
import { FormMessage, SubmitButton, usePersistentAction } from '@/components/forms';

export function SandboxConnectForm() {
  const [state, onSubmit, pending] = usePersistentAction(connectSandboxAccountAction, {});
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-2">
      <SubmitButton pending={pending} className="btn-ghost" pendingText="Conectando…">
        Usar cuenta de prueba
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function DisconnectForm() {
  const [state, onSubmit, pending] = usePersistentAction(disconnectPaymentAccountAction, {});
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button type="button" className="btn-ghost text-sm" onClick={() => setConfirming(true)}>
        Desconectar
      </button>
    );
  }
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-2 rounded-xl border border-danger/40 bg-danger/5 p-3 text-sm">
      <p>
        Sin Mercado Pago no puedes tener partidas activas con cuota: antes déjalas gratis, termínalas o cancélalas. Los pagos ya
        recibidos no cambian.
      </p>
      <div className="flex gap-2">
        <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setConfirming(false)}>
          Cancelar
        </button>
        <SubmitButton pending={pending} className="btn-danger px-3 py-1.5 text-sm" pendingText="Desconectando…">
          Desconectar
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function RefundForm({ paymentId, amount }: { paymentId: string; amount: string }) {
  const [state, onSubmit, pending] = usePersistentAction(refundRegistrationPaymentAction, {});
  const [open, setOpen] = useState(false);
  if (state.ok) return <span className="text-xs text-lime">Reembolsado</span>;
  if (!open) {
    return (
      <button type="button" className="text-xs font-semibold text-neon hover:underline" onClick={() => setOpen(true)}>
        Reembolsar
      </button>
    );
  }
  return (
    <form method="post" onSubmit={onSubmit} className="mt-2 space-y-2 text-left">
      <input type="hidden" name="paymentId" value={paymentId} />
      <label className="block">
        <span className="label">Motivo del reembolso de {amount}</span>
        <input name="reason" required minLength={5} maxLength={300} className="input" placeholder="Se lo informamos al jugador" />
      </label>
      <p className="text-xs text-muted">Se devuelve el importe completo. Si la partida sigue abierta, la inscripción se retira y libera el cupo.</p>
      <div className="flex gap-2">
        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setOpen(false)}>
          Cancelar
        </button>
        <SubmitButton pending={pending} className="btn-danger px-3 py-1.5 text-xs" pendingText="Reembolsando…">
          Confirmar reembolso
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
