'use client';

import { useState } from 'react';
import { Ban, CircleStop, Plus, Radio, RotateCcw, Trash2 } from 'lucide-react';
import { deleteStreamAction, saveStreamAction, streamStatusAction } from '@/app/actions';
import type { MatchStreamInfo, StreamStatus } from '@/lib/types';
import { toLocalInput } from '@/lib/format';
import { FormMessage, SubmitButton, TzOffsetInput, usePersistentAction } from '@/components/forms';
import { StreamBadge, WatchLink } from '@/components/stream';

/** Detección de plataforma en el navegador (orientativa: la API valida y decide). */
const HOSTS: [RegExp, string][] = [
  [/(^|\.)youtube\.com$|^youtu\.be$/, 'YouTube Live'],
  [/(^|\.)twitch\.tv$/, 'Twitch'],
  [/(^|\.)facebook\.com$|^fb\.watch$/, 'Facebook Live'],
  [/(^|\.)tiktok\.com$/, 'TikTok Live'],
  [/(^|\.)kick\.com$/, 'Kick'],
];

function detect(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return { error: 'Solo se aceptan enlaces HTTPS' };
    const found = HOSTS.find(([re]) => re.test(u.hostname.toLowerCase()));
    return { platform: found?.[1] ?? 'Otra plataforma (se valida contra la lista autorizada)' };
  } catch {
    return url ? { error: 'Formato de URL no válido' } : {};
  }
}

export function StreamManager({
  tournamentId,
  matchId,
  stream,
  rebroadcasts,
  matchScheduledAt,
}: {
  tournamentId: string;
  matchId: string;
  stream: MatchStreamInfo | null;
  rebroadcasts: MatchStreamInfo[];
  matchScheduledAt: string | null;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-4">
      {stream ? (
        <StreamCardEditor key={stream.id + stream.updatedAt} tournamentId={tournamentId} matchId={matchId} stream={stream} />
      ) : (
        <section className="card space-y-3 p-5">
          <h2 className="text-lg font-bold uppercase">Transmisión en vivo</h2>
          <p className="text-sm text-muted">Este encuentro no tiene transmisión. Agrega el enlace del canal donde se verá.</p>
          <StreamForm tournamentId={tournamentId} matchId={matchId} defaultStart={matchScheduledAt} />
        </section>
      )}

      {rebroadcasts.map((r) => (
        <StreamCardEditor key={r.id + r.updatedAt} tournamentId={tournamentId} matchId={matchId} stream={r} />
      ))}

      {stream && (
        <div>
          {adding ? (
            <section className="card space-y-3 p-5">
              <h2 className="text-lg font-bold uppercase">Nueva retransmisión</h2>
              <p className="text-sm text-muted">Otra señal del mismo encuentro (otro idioma, otro canal). No reemplaza a la principal.</p>
              <StreamForm tournamentId={tournamentId} matchId={matchId} defaultStart={matchScheduledAt} rebroadcast onDone={() => setAdding(false)} />
            </section>
          ) : (
            <button type="button" className="btn-ghost text-sm" onClick={() => setAdding(true)}>
              <Plus className="size-4" /> Agregar retransmisión
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function StreamCardEditor({ tournamentId, matchId, stream }: { tournamentId: string; matchId: string; stream: MatchStreamInfo }) {
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [status, onStatus, changing] = usePersistentAction(streamStatusAction, {});
  const [del, onDelete, deleting] = usePersistentAction(deleteStreamAction, {});

  const actions: { to: StreamStatus; label: string; icon: React.ReactNode; className: string; reason?: boolean }[] = [];
  if (stream.status === 'SCHEDULED') actions.push({ to: 'LIVE', label: 'Activar EN VIVO', icon: <Radio className="size-4" />, className: 'btn-danger' });
  if (stream.status === 'LIVE') actions.push({ to: 'ENDED', label: 'Finalizar transmisión', icon: <CircleStop className="size-4" />, className: 'btn-ghost' });
  if (stream.status === 'ENDED') actions.push({ to: 'LIVE', label: 'Reanudar EN VIVO', icon: <Radio className="size-4" />, className: 'btn-ghost' });
  if (stream.status === 'CANCELLED') actions.push({ to: 'SCHEDULED', label: 'Reprogramar', icon: <RotateCcw className="size-4" />, className: 'btn-ghost' });

  return (
    <section className={`card space-y-4 p-5 ${stream.status === 'LIVE' ? 'border-danger/50' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-bold uppercase">{stream.isRebroadcast ? 'Retransmisión' : 'Transmisión principal'}</h2>
        <StreamBadge status={stream.status} />
        <span className="chip">{stream.platformName}</span>
        <span className="chip">{stream.visibility === 'PRIVATE' ? 'Privada' : 'Pública'}</span>
      </div>
      <div className="space-y-1 text-sm">
        {stream.title && <p className="font-semibold">{stream.title}</p>}
        {stream.url && <p className="break-all text-muted">{stream.url}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {actions.map((a) => (
          <form key={a.to} onSubmit={onStatus}>
            <input type="hidden" name="tournamentId" value={tournamentId} />
            <input type="hidden" name="matchId" value={matchId} />
            <input type="hidden" name="streamId" value={stream.id} />
            <SubmitButton name="status" value={a.to} pending={changing} className={a.className} pendingText="…">
              {a.icon} {a.label}
            </SubmitButton>
          </form>
        ))}
        {(stream.status === 'SCHEDULED' || stream.status === 'LIVE') && (
          <details className="group">
            <summary className="btn-ghost cursor-pointer list-none">
              <Ban className="size-4" /> Cancelar transmisión
            </summary>
            <form onSubmit={onStatus} className="mt-2 flex flex-wrap gap-2">
              <input type="hidden" name="tournamentId" value={tournamentId} />
              <input type="hidden" name="matchId" value={matchId} />
              <input type="hidden" name="streamId" value={stream.id} />
              <input name="reason" maxLength={300} placeholder="Motivo (se notifica)" className="input w-64" />
              <SubmitButton name="status" value="CANCELLED" pending={changing} className="btn-danger" pendingText="…">
                Confirmar cancelación
              </SubmitButton>
            </form>
          </details>
        )}
        {stream.url && <WatchLink url={stream.url} platformName={stream.platformName} compact />}
        <span className="ml-auto flex gap-2">
          <button type="button" className="btn-ghost" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Cerrar edición' : 'Editar'}
          </button>
          <button type="button" className="btn-ghost text-danger" onClick={() => setRemoving((v) => !v)} aria-expanded={removing}>
            <Trash2 className="size-4" /> Eliminar enlace
          </button>
        </span>
      </div>
      <FormMessage state={status} />

      {removing && (
        <form onSubmit={onDelete} className="flex flex-wrap items-end gap-2 rounded-xl border border-danger/40 bg-danger/5 p-3">
          <input type="hidden" name="tournamentId" value={tournamentId} />
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="streamId" value={stream.id} />
          <label className="block min-w-60 flex-1">
            <span className="label">Motivo (queda en el historial)</span>
            <input name="reason" maxLength={300} className="input" />
          </label>
          <SubmitButton pending={deleting} className="btn-danger" pendingText="Eliminando…">
            Eliminar enlace
          </SubmitButton>
          <p className="w-full text-xs text-muted">El enlace deja de mostrarse; el historial de cambios se conserva.</p>
        </form>
      )}
      <FormMessage state={del} />

      {editing && <StreamForm tournamentId={tournamentId} matchId={matchId} stream={stream} onDone={() => setEditing(false)} />}
    </section>
  );
}

function StreamForm({
  tournamentId,
  matchId,
  stream,
  defaultStart,
  rebroadcast = false,
  onDone,
}: {
  tournamentId: string;
  matchId: string;
  stream?: MatchStreamInfo;
  defaultStart?: string | null;
  rebroadcast?: boolean;
  onDone?: () => void;
}) {
  const [state, onSubmit, pending] = usePersistentAction(async (prev: Awaited<ReturnType<typeof saveStreamAction>>, fd: FormData) => {
    const res = await saveStreamAction(prev, fd);
    if (res.ok) onDone?.();
    return res;
  }, {});
  const [url, setUrl] = useState(stream?.url ?? '');
  const hint = detect(url);

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border border-line bg-surface-2 p-4 sm:grid-cols-2">
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="matchId" value={matchId} />
      {stream && <input type="hidden" name="streamId" value={stream.id} />}
      {rebroadcast && <input type="hidden" name="isRebroadcast" value="on" />}
      <TzOffsetInput />
      <label className="block sm:col-span-2">
        <span className="label">URL de la transmisión</span>
        <input
          name="url"
          type="url"
          required
          inputMode="url"
          maxLength={500}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.twitch.tv/tu-canal"
          className="input"
          aria-describedby={`platform-${stream?.id ?? 'new'}`}
        />
        <span id={`platform-${stream?.id ?? 'new'}`} className={`mt-1 block text-xs ${hint.error ? 'text-danger' : 'text-muted'}`}>
          {hint.error ?? (hint.platform ? `Plataforma: ${hint.platform}` : 'YouTube, Twitch, Facebook, TikTok, Kick u otra autorizada')}
        </span>
      </label>
      <label className="block">
        <span className="label">Título (opcional)</span>
        <input name="title" defaultValue={stream?.title ?? ''} maxLength={120} placeholder="Semifinal · narración en español" className="input" />
      </label>
      <label className="block">
        <span className="label">Visibilidad</span>
        <select name="visibility" defaultValue={stream?.visibility ?? 'PUBLIC'} className="input">
          <option value="PUBLIC">Pública: cualquiera ve el enlace</option>
          <option value="PRIVATE">Privada: solo los participantes del encuentro</option>
        </select>
      </label>
      <label className="block">
        <span className="label">Inicio programado</span>
        <input type="datetime-local" name="scheduledStartAt" defaultValue={toLocalInput(stream ? stream.scheduledStartAt : defaultStart)} className="input" />
      </label>
      <label className="block">
        <span className="label">Fin programado (opcional)</span>
        <input type="datetime-local" name="scheduledEndAt" defaultValue={toLocalInput(stream?.scheduledEndAt)} className="input" />
      </label>
      <label className="block sm:col-span-2">
        <span className="label">Descripción (opcional)</span>
        <textarea name="description" defaultValue={stream?.description ?? ''} maxLength={1000} rows={2} className="input" />
      </label>
      {stream && (
        <label className="block sm:col-span-2">
          <span className="label">Motivo del cambio (queda en el historial; si cambias el enlace, se notifica)</span>
          <input name="reason" maxLength={300} className="input" />
        </label>
      )}
      <div className="flex items-center gap-3 sm:col-span-2">
        <SubmitButton pending={pending} pendingText="Guardando…">
          {stream ? 'Guardar cambios' : rebroadcast ? 'Agregar retransmisión' : 'Configurar transmisión'}
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}
