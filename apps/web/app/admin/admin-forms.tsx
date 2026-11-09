'use client';

import { useState, useTransition } from 'react';
import { ExternalLink } from 'lucide-react';
import {
  moderateRatingAction,
  privateFileUrlAction,
  resolveIncidentAction,
  reviewCancellationAction,
  runVerificationMaintenanceAction,
  verificationAdminAction,
} from '@/app/actions';
import type { VerificationStatus } from '@/lib/types';
import { FormMessage, SubmitButton, usePersistentAction } from '@/components/forms';

const ACTIONS: { action: string; label: string; from: VerificationStatus[]; reason: boolean; tone: string; months?: boolean }[] = [
  { action: 'START_REVIEW', label: 'Iniciar revisión', from: ['PENDING'], reason: false, tone: 'btn-ghost' },
  { action: 'REQUEST_INFO', label: 'Solicitar información', from: ['PENDING', 'UNDER_REVIEW'], reason: true, tone: 'btn-ghost' },
  { action: 'APPROVE', label: 'Aprobar', from: ['PENDING', 'UNDER_REVIEW'], reason: false, tone: 'btn-primary', months: true },
  { action: 'REJECT', label: 'Rechazar', from: ['PENDING', 'UNDER_REVIEW'], reason: true, tone: 'btn-danger' },
  { action: 'RENEW', label: 'Renovar vigencia', from: ['VERIFIED'], reason: false, tone: 'btn-ghost', months: true },
  { action: 'SUSPEND', label: 'Suspender', from: ['VERIFIED'], reason: true, tone: 'btn-danger' },
  { action: 'REINSTATE', label: 'Rehabilitar', from: ['SUSPENDED'], reason: true, tone: 'btn-primary' },
];

/** Acciones administrativas sobre una solicitud. Cada una queda en el historial y en la auditoría. */
export function VerificationActions({ id, status }: { id: string; status: VerificationStatus }) {
  const available = ACTIONS.filter((a) => a.from.includes(status));
  const [selected, setSelected] = useState(available[0]?.action ?? '');
  const [state, onSubmit, pending] = usePersistentAction(verificationAdminAction, {});
  const current = available.find((a) => a.action === selected);
  if (!available.length) return <p className="text-sm text-muted">No hay acciones disponibles para el estado actual.</p>;

  return (
    <form method="post" onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={selected} />
      <div className="flex flex-wrap gap-2">
        {available.map((a) => (
          <button
            key={a.action}
            type="button"
            onClick={() => setSelected(a.action)}
            className={`chip px-3 py-1.5 ${selected === a.action ? 'border-neon text-neon' : ''}`}
          >
            {a.label}
          </button>
        ))}
      </div>
      {current?.reason && (
        <label className="block">
          <span className="label">{selected === 'REQUEST_INFO' ? 'Información solicitada (la ve el organizador)' : 'Motivo (lo ve el organizador)'}</span>
          <textarea name="reason" required minLength={5} maxLength={1000} rows={2} className="input" />
        </label>
      )}
      {current?.months && (
        <label className="block">
          <span className="label">Vigencia (meses)</span>
          <input type="number" name="months" min={1} max={36} defaultValue={12} className="input w-28" />
        </label>
      )}
      <label className="block">
        <span className="label">Observaciones internas (privadas)</span>
        <textarea name="comments" maxLength={2000} rows={2} className="input" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} className={current?.tone ?? 'btn-primary'} pendingText="Registrando…">
          {current?.label}
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

/** Abre un documento privado mediante una URL firmada de 5 minutos (cada acceso queda auditado). */
export function OpenPrivateFile({ kind, id, documentId, label }: { kind: 'verification' | 'incident'; id: string; documentId?: string; label: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className="inline-flex items-center gap-1 text-sm text-neon hover:underline disabled:opacity-50"
        onClick={() =>
          start(async () => {
            setError(null);
            // La pestaña se abre antes de la llamada para no ser bloqueada como ventana emergente
            // (con 'noopener' window.open devuelve null; se anula opener a mano)
            const win = window.open('about:blank', '_blank');
            if (win) win.opener = null;
            const res = await privateFileUrlAction(kind, id, documentId);
            if (res.url && win) win.location.href = res.url;
            else {
              win?.close();
              setError(res.error ?? 'No se pudo abrir el archivo');
            }
          })
        }
      >
        <ExternalLink className="size-3.5" /> {pending ? 'Abriendo…' : label}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}

export function MaintenanceButton() {
  const [state, onSubmit, pending] = usePersistentAction(runVerificationMaintenanceAction, {});
  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-wrap items-center gap-3">
      <SubmitButton pending={pending} className="btn-ghost text-xs" pendingText="Procesando…">
        Procesar vencimientos y conservación
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function ModerationForm({ id }: { id: string }) {
  const [state, onSubmit, pending] = usePersistentAction(moderateRatingAction, {});
  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="block min-w-48 flex-1">
        <span className="label">Justificación (obligatoria, queda en auditoría)</span>
        <input name="reason" required minLength={5} maxLength={500} className="input py-1.5 text-sm" />
      </label>
      <SubmitButton name="status" value="APPROVED" pending={pending} className="btn-primary px-3 py-1.5 text-xs" pendingText="…">
        Publicar
      </SubmitButton>
      <SubmitButton name="status" value="HIDDEN" pending={pending} className="btn-ghost px-3 py-1.5 text-xs" pendingText="…">
        Ocultar
      </SubmitButton>
      <SubmitButton name="status" value="SUSPENDED" pending={pending} className="btn-danger px-3 py-1.5 text-xs" pendingText="…">
        Suspender (fraude)
      </SubmitButton>
      <div className="w-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function ResolveIncidentForm({ id }: { id: string }) {
  const [state, onSubmit, pending] = usePersistentAction(resolveIncidentAction, {});
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <label className="block">
        <span className="label">Resolución administrativa (pública si se confirma)</span>
        <textarea name="resolution" required minLength={5} maxLength={2000} rows={2} className="input" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton name="status" value="UNDER_REVIEW" pending={pending} className="btn-ghost px-3 py-1.5 text-xs" pendingText="…">
          En revisión
        </SubmitButton>
        <SubmitButton name="status" value="RESOLVED" pending={pending} className="btn-danger px-3 py-1.5 text-xs" pendingText="…">
          Confirmar
        </SubmitButton>
        <SubmitButton name="status" value="DISMISSED" pending={pending} className="btn-ghost px-3 py-1.5 text-xs" pendingText="…">
          Desestimar
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function CancellationForm({ id }: { id: string }) {
  const [state, onSubmit, pending] = usePersistentAction(reviewCancellationAction, {});
  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="block min-w-48 flex-1">
        <span className="label">Justificación</span>
        <input name="reason" required minLength={5} maxLength={500} className="input py-1.5 text-sm" />
      </label>
      <SubmitButton name="justified" value="true" pending={pending} className="btn-primary px-3 py-1.5 text-xs" pendingText="…">
        Justificada
      </SubmitButton>
      <SubmitButton name="justified" value="false" pending={pending} className="btn-danger px-3 py-1.5 text-xs" pendingText="…">
        Injustificada
      </SubmitButton>
      <div className="w-full">
        <FormMessage state={state} />
      </div>
    </form>
  );
}
