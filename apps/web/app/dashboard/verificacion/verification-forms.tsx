'use client';

import { provideVerificationInfoAction, requestVerificationAction } from '@/app/actions';
import type { MyVerification } from '@/lib/types';
import { COUNTRIES, ORGANIZER_TYPE_LABEL } from '@/lib/format';
import { FormMessage, SubmitButton, usePersistentAction } from '@/components/forms';

const SOCIAL = ['instagram', 'x', 'youtube', 'twitch', 'tiktok', 'facebook', 'discord', 'kick'];

export function VerificationForm({ prefill }: { prefill: MyVerification['prefill'] }) {
  const [state, onSubmit, pending] = usePersistentAction(requestVerificationAction, {});
  return (
    <form method="post" onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <Field label="Nombre del organizador" name="organizerName" defaultValue={prefill.organizerName} required minLength={2} maxLength={80} />
      <Field label="Nombre comercial o razón social (opcional)" name="legalName" defaultValue={prefill.legalName ?? ''} maxLength={160} />
      <label className="block">
        <span className="label">Tipo de organizador</span>
        <select name="verificationType" defaultValue={prefill.verificationType} className="input">
          {Object.entries(ORGANIZER_TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">País</span>
        <select name="country" defaultValue={prefill.country} className="input">
          {Object.entries(COUNTRIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <Field label="Ciudad" name="city" defaultValue={prefill.city} required minLength={2} maxLength={80} />
      <Field label="Correo de contacto" name="contactEmail" type="email" defaultValue={prefill.contactEmail} required />
      <Field label="Teléfono de contacto" name="contactPhone" defaultValue={prefill.contactPhone} required placeholder="+51 999 888 777" />
      <Field label="Sitio web (opcional)" name="website" type="url" defaultValue={prefill.website} placeholder="https://" />
      <label className="block sm:col-span-2">
        <span className="label">Descripción del organizador</span>
        <textarea name="description" defaultValue={prefill.description} required minLength={30} maxLength={2000} rows={4} className="input" />
      </label>
      <details className="sm:col-span-2">
        <summary className="cursor-pointer text-sm text-muted hover:text-ink">Redes sociales (opcional, enlaces https)</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {SOCIAL.map((k) => (
            <Field key={k} label={k === "x" ? "X" : k[0].toUpperCase() + k.slice(1)} name={`social_${k}`} type="url" defaultValue={prefill.socialLinks?.[k] ?? ''} placeholder="https://" />
          ))}
        </div>
      </details>
      <label className="block">
        <span className="label">Tipo de documentación</span>
        <select name="documentType" className="input">
          <option value="IDENTITY">Documento de identidad</option>
          <option value="TAX_ID">Registro tributario (RUC, RUT, NIT…)</option>
          <option value="INCORPORATION">Constitución de la empresa o club</option>
          <option value="AUTHORIZATION">Poder o autorización</option>
          <option value="SUPPORTING_DOCUMENT">Otro documento de respaldo</option>
        </select>
      </label>
      <label className="block">
        <span className="label">Documentos de respaldo (PDF, JPG, PNG o WebP · hasta 5)</span>
        <input type="file" name="documents" multiple accept="application/pdf,image/jpeg,image/png,image/webp" className="input file:mr-3 file:rounded-lg file:border-0 file:bg-surface-3 file:px-3 file:py-1 file:text-ink" />
      </label>
      <p className="text-xs text-muted sm:col-span-2">
        Los documentos se guardan en almacenamiento privado, solo los ve el equipo de verificación mediante enlaces temporales
        y se eliminan después de la decisión (90 días si se aprueba, 30 si se rechaza). Usamos tu logo actual como logo oficial.
      </p>
      <label className="flex items-start gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="acceptPolicy" required className="mt-1 accent-[var(--color-neon)]" />
        Declaro que la información es veraz y acepto las políticas de verificación. Entiendo que la verificación puede
        suspenderse si la información resulta falsa.
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <SubmitButton pending={pending} pendingText="Enviando…">
          Enviar solicitud
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function InfoForm() {
  const [state, onSubmit, pending] = usePersistentAction(provideVerificationInfoAction, {});
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-3">
      <label className="block">
        <span className="label">Tu respuesta</span>
        <textarea name="message" required minLength={5} maxLength={2000} rows={3} className="input" />
      </label>
      <input type="file" name="documents" multiple accept="application/pdf,image/jpeg,image/png,image/webp" className="input" />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} pendingText="Enviando…">
          Enviar información
        </SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input {...props} className="input" />
    </label>
  );
}
