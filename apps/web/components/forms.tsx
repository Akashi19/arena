'use client';

import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, ImageUp, Loader2, Sparkles } from 'lucide-react';
import { uploadImageAction, type ActionState } from '@/app/actions';

/**
 * Como useActionState, pero envía el formulario sin el reseteo automático de React 19:
 * si la API devuelve un error, el usuario conserva lo que escribió.
 */
export function usePersistentAction<S>(fn: (state: Awaited<S>, fd: FormData) => S | Promise<S>, initial: Awaited<S>) {
  const [state, formAction, pending] = useActionState(fn, initial);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => formAction(fd));
  };
  return [state, onSubmit, pending] as const;
}

export function SubmitButton({
  children,
  className = 'btn-primary',
  pendingText = 'Guardando…',
  name,
  value,
  pending: pendingProp,
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
  name?: string;
  value?: string;
  pending?: boolean;
}) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <button type="submit" className={className} disabled={pending} name={name} value={value}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" /> {pendingText}
        </>
      ) : (
        children
      )}
    </button>
  );
}

/** Mensaje de resultado. Los límites del plan muestran una llamada a actualizar la suscripción. */
export function FormMessage({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <div role="alert" className={clsx('flex gap-2 rounded-xl border p-3 text-sm', state.planLimit ? 'border-amber/50 bg-amber/10 text-amber' : 'border-danger/50 bg-danger/10 text-danger')}>
        {state.planLimit ? <Sparkles className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
        <div>
          <p>{state.error}</p>
          {state.planLimit && (
            <Link href="/dashboard/suscripcion" className="mt-1 inline-block font-semibold underline underline-offset-2">
              Ver planes y actualizar
            </Link>
          )}
        </div>
      </div>
    );
  }
  if (state.ok && state.message) {
    return (
      <div role="status" className="flex items-center gap-2 rounded-xl border border-lime/40 bg-lime/10 p-3 text-sm text-lime">
        <CheckCircle2 className="size-4" /> {state.message}
      </div>
    );
  }
  return null;
}

/** Subida de imagen con vista previa inmediata (logo, banner, avatar, portada, escudo). */
export function ImageUpload({
  target,
  id,
  current,
  label,
  shape = 'square',
}: {
  target: 'logo' | 'banner' | 'avatar' | 'cover' | 'team';
  id?: string;
  current?: string | null;
  label: string;
  shape?: 'square' | 'wide';
}) {
  const [state, action] = useActionState(uploadImageAction, {});
  const [preview, setPreview] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const src = preview ?? current;
  return (
    <form ref={formRef} action={action} className="space-y-2">
      <input type="hidden" name="target" value={target} />
      {id && <input type="hidden" name="id" value={id} />}
      <span className="label">{label}</span>
      <label
        className={clsx(
          'group relative grid cursor-pointer place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-line bg-surface-2 transition hover:border-neon',
          shape === 'square' ? 'size-32' : 'h-32 w-full',
        )}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-xs text-muted">
            <ImageUp className="size-6" /> PNG, JPG o WEBP · 5 MB
          </span>
        )}
        <span className="absolute inset-0 hidden place-items-center bg-bg/70 text-xs font-semibold text-neon group-hover:grid">Cambiar</span>
        <input
          type="file"
          name="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setPreview(URL.createObjectURL(f));
            formRef.current?.requestSubmit();
          }}
        />
      </label>
      <FormMessage state={state} />
    </form>
  );
}

/** Campo de archivo con vista previa para formularios que suben imagen junto con otros datos. */
export function ImageField({ name, label }: { name: string; label: string }) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  return (
    <div>
      <span className="label">{label}</span>
      <label className="group relative grid size-24 cursor-pointer place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-line bg-surface-2 hover:border-neon">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <ImageUp className="size-6 text-muted" />
        )}
        <input
          type="file"
          name={name}
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setPreview(f ? URL.createObjectURL(f) : null);
          }}
        />
      </label>
    </div>
  );
}

/** Envía el desfase horario del navegador para interpretar correctamente <input type="datetime-local">. */
export function TzOffsetInput() {
  const [offset, setOffset] = useState('');
  useEffect(() => setOffset(String(new Date().getTimezoneOffset())), []);
  return <input type="hidden" name="tzOffset" value={offset} />;
}
