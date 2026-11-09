'use client';

import { setNotificationPreferenceAction } from '@/app/actions';
import type { NotificationPreference } from '@/lib/types';
import { STREAM_NOTIFICATION_LABEL } from '@/lib/format';
import { FormMessage, SubmitButton, usePersistentAction } from '@/components/forms';

/** Avisos de transmisiones: cada tipo se activa o desactiva por canal. */
export function StreamNotificationPreferences({ prefs }: { prefs: NotificationPreference[] }) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[480px] text-sm">
        <caption className="sr-only">Preferencias de avisos de transmisiones</caption>
        <thead className="text-[11px] uppercase tracking-wider text-muted">
          <tr>
            <th scope="col" className="py-2 text-left font-semibold">
              Aviso
            </th>
            <th scope="col" className="px-2 py-2 font-semibold">
              En Arena
            </th>
            <th scope="col" className="px-2 py-2 font-semibold">
              Email
            </th>
            <th scope="col" className="px-2 py-2 font-semibold">
              WhatsApp
            </th>
            <th scope="col" className="sr-only">
              Guardar
            </th>
          </tr>
        </thead>
        <tbody>
          {prefs.map((p) => (
            <PreferenceRow key={p.type} pref={p} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreferenceRow({ pref }: { pref: NotificationPreference }) {
  const [state, onSubmit, pending] = usePersistentAction(setNotificationPreferenceAction, {});
  const label = STREAM_NOTIFICATION_LABEL[pref.type] ?? { title: pref.type, hint: '' };
  const form = `pref-${pref.type}`;
  return (
    <tr className="border-t border-line align-top">
      <td className="py-2.5 pr-2">
        <p className="font-semibold">{label.title}</p>
        <p className="text-xs text-muted">{label.hint}</p>
        <form id={form} onSubmit={onSubmit}>
          <input type="hidden" name="type" value={pref.type} />
        </form>
        <FormMessage state={state} />
      </td>
      {(['inApp', 'email', 'whatsapp'] as const).map((ch) => (
        <td key={ch} className="px-2 py-2.5 text-center">
          <input
            form={form}
            type="checkbox"
            name={ch}
            defaultChecked={pref[ch]}
            aria-label={`${label.title}: ${ch === 'inApp' ? 'en Arena' : ch === 'email' ? 'email' : 'WhatsApp'}`}
            className="size-4 accent-[var(--color-neon)]"
          />
        </td>
      ))}
      <td className="py-2 text-right">
        <SubmitButton form={form} pending={pending} className="btn-ghost px-2 py-1 text-xs" pendingText="…">
          Guardar
        </SubmitButton>
      </td>
    </tr>
  );
}
