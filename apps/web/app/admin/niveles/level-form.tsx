'use client';

import { useState } from 'react';
import { levelVerificationAction } from '@/app/actions';
import type { CompetitiveLevel, LevelVerificationType } from '@/lib/types';
import { LEVEL_LABEL } from '@/lib/format';
import { FormMessage, SubmitButton, usePersistentAction } from '@/components/forms';

/**
 * Validación externa del nivel: exige la fuente autorizada y una justificación (auditoría).
 * Revocar devuelve el perfil a "declarado" y la plataforma lo reevalúa con sus estadísticas.
 */
export function LevelVerificationForm({
  id,
  type,
  level,
  rankId,
  ranks,
}: {
  id: string;
  type: LevelVerificationType;
  level: CompetitiveLevel;
  rankId: string | null;
  ranks: { id: string; rankName: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, onSubmit, pending] = usePersistentAction(levelVerificationAction, {});
  const external = type === 'EXTERNAL_VERIFIED';
  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setOpen(true)}>
          {external ? 'Actualizar o revocar' : 'Validar externamente'}
        </button>
        <FormMessage state={state} />
      </div>
    );
  }
  return (
    <form method="post" onSubmit={onSubmit} className="grid gap-2 rounded-xl border border-line bg-surface-2 p-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={id} />
      <label className="block sm:col-span-2">
        <span className="label">Fuente externa autorizada</span>
        <input name="source" maxLength={200} placeholder="Captura verificada del cliente oficial, API del editor…" className="input" />
      </label>
      <label className="block">
        <span className="label">Nivel validado</span>
        <select name="competitiveLevel" defaultValue={level} className="input">
          {(Object.keys(LEVEL_LABEL) as CompetitiveLevel[]).map((l) => (
            <option key={l} value={l}>
              {LEVEL_LABEL[l]}
            </option>
          ))}
        </select>
      </label>
      {ranks.length > 0 && (
        <label className="block">
          <span className="label">Rango validado</span>
          <select name="gameRankId" defaultValue={rankId ?? ''} className="input">
            <option value="">Mantener el declarado</option>
            {ranks.map((r) => (
              <option key={r.id} value={r.id}>
                {r.rankName}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block sm:col-span-2">
        <span className="label">Justificación (queda en auditoría)</span>
        <input name="reason" required minLength={5} maxLength={500} className="input" />
      </label>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <SubmitButton pending={pending} name="action" value="EXTERNAL" pendingText="Guardando…">
          Validar
        </SubmitButton>
        {external && (
          <SubmitButton pending={pending} name="action" value="REVOKE" className="btn-danger" pendingText="…">
            Revocar validación
          </SubmitButton>
        )}
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Cancelar
        </button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
