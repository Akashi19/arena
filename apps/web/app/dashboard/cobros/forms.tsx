'use client';

import { useState } from 'react';
import {
  connectSandboxAccountAction,
  disablePayoutProfileAction,
  disconnectPaymentAccountAction,
  refundRegistrationPaymentAction,
  savePayoutProfileAction,
} from '@/app/actions';
import { COUNTRIES, PAYOUT_ACCOUNT_TYPE_LABEL } from '@/lib/format';
import type { PayoutProfile } from '@/lib/types';
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
        Sin Mercado Pago ni el cobro a través de Arena no puedes tener partidas activas con cuota: antes déjalas gratis,
        termínalas, cancélalas o activa el cobro a través de Arena. Los pagos ya recibidos no cambian.
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

const ACCOUNT_TYPES = Object.entries(PAYOUT_ACCOUNT_TYPE_LABEL);

/** Datos de liquidación para cobrar a través de Arena. El número de cuenta nunca vuelve al navegador: vacío lo conserva. */
export function PayoutProfileForm({ initial, defaultCountry }: { initial: PayoutProfile | null; defaultCountry: string }) {
  const [state, onSubmit, pending] = usePersistentAction(savePayoutProfileAction, {});
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Titular de la cuenta</span>
          <input name="holderName" required minLength={3} maxLength={120} defaultValue={initial?.holderName} className="input" autoComplete="name" />
        </label>
        <label className="block">
          <span className="label">Documento del titular (DNI, RUC, RUT…)</span>
          <input name="documentId" required pattern="[A-Za-z0-9.\-]{5,30}" maxLength={30} defaultValue={initial?.documentId} className="input" />
        </label>
        <label className="block">
          <span className="label">Banco o billetera</span>
          <input name="bankName" required minLength={2} maxLength={80} defaultValue={initial?.bankName} className="input" placeholder="BCP, Interbank, Yape…" />
        </label>
        <label className="block">
          <span className="label">Tipo de cuenta</span>
          <select name="accountType" required defaultValue={initial?.accountType ?? 'SAVINGS'} className="input">
            {ACCOUNT_TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Número de cuenta, CCI, CBU o CLABE</span>
          <input
            name="accountNumber"
            required={!initial}
            inputMode="numeric"
            autoComplete="off"
            maxLength={40}
            className="input"
            placeholder={initial ? `Guardada: ${initial.accountNumberMasked} (déjalo vacío para conservarla)` : ''}
          />
        </label>
        <label className="block">
          <span className="label">País de la cuenta</span>
          <select name="country" required defaultValue={initial?.country ?? defaultCountry} className="input">
            {Object.entries(COUNTRIES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-muted">El número de cuenta se guarda cifrado y solo el equipo de Arena lo ve para hacerte la transferencia.</p>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} pendingText="Guardando…">
          {initial?.enabled ? 'Guardar cambios' : 'Activar cobro a través de Arena'}
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function DisablePayoutForm() {
  const [state, onSubmit, pending] = usePersistentAction(disablePayoutProfileAction, {});
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button type="button" className="btn-ghost text-sm" onClick={() => setConfirming(true)}>
        Desactivar
      </button>
    );
  }
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-2 rounded-xl border border-danger/40 bg-danger/5 p-3 text-sm">
      <p>Sin otra forma de cobro no puedes tener partidas activas con cuota. Lo ya cobrado se te liquida igual.</p>
      <div className="flex gap-2">
        <button type="button" className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setConfirming(false)}>
          Cancelar
        </button>
        <SubmitButton pending={pending} className="btn-danger px-3 py-1.5 text-sm" pendingText="Desactivando…">
          Desactivar
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
