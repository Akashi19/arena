'use client';

import { useState } from 'react';
import { registerAction } from '@/app/actions';
import { FormMessage, ImageField, SubmitButton, usePersistentAction } from '@/components/forms';
import { COUNTRIES, ORGANIZER_TYPE_LABEL } from '@/lib/format';

export function RegisterForm() {
  const [state, onSubmit, pending] = usePersistentAction(registerAction, {});
  const [asOrganizer, setAsOrganizer] = useState(true);

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-5">
      <div className="grid gap-1 rounded-xl border border-line bg-surface-2 p-1 text-sm font-semibold sm:grid-cols-2">
        {[
          [true, 'Quiero organizar torneos'],
          [false, 'Solo quiero competir'],
        ].map(([value, text]) => (
          <button
            key={String(value)}
            type="button"
            onClick={() => setAsOrganizer(value as boolean)}
            className={`rounded-lg py-2 ${asOrganizer === value ? 'bg-neon text-bg' : 'text-muted hover:text-ink'}`}
          >
            {text as string}
          </button>
        ))}
      </div>
      <input type="hidden" name="asOrganizer" value={asOrganizer ? 'on' : 'off'} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="firstName" label="Nombres" autoComplete="given-name" />
        <Field name="lastName" label="Apellidos" autoComplete="family-name" />
        <Field name="username" label="Nombre de usuario" autoComplete="username" pattern="[a-zA-Z0-9_\-]{3,24}" hint="3-24 caracteres: letras, números, _ o -" />
        <Field name="email" label="Correo electrónico" type="email" autoComplete="email" />
        <Field name="password" label="Contraseña" type="password" autoComplete="new-password" minLength={8} hint="Mínimo 8 caracteres, con letras y números" />
        <label className="block">
          <span className="label">País</span>
          <select name="country" required className="input" defaultValue="PE">
            {Object.entries(COUNTRIES).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <Field name="city" label="Ciudad" autoComplete="address-level2" />
        <Field name="phone" label="Teléfono (opcional)" type="tel" required={false} autoComplete="tel" />
      </div>

      {asOrganizer && (
        <fieldset className="space-y-4 rounded-2xl border border-neon/30 bg-neon/5 p-4">
          <legend className="px-2 font-display text-lg font-bold uppercase text-neon">Identidad del organizador</legend>
          <div className="flex flex-col gap-4 sm:flex-row">
            <ImageField name="logo" label="Logo" />
            <div className="grid flex-1 gap-4">
              <Field name="organizerName" label="Nombre público" required={false} hint="Por defecto, tu nombre y apellido" />
              <label className="block">
                <span className="label">Tipo de organizador</span>
                <select name="organizerType" className="input" defaultValue="PERSON">
                  {Object.entries(ORGANIZER_TYPE_LABEL).map(([v, t]) => (
                    <option key={v} value={v}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <p className="text-xs text-muted">Tu logo aparecerá automáticamente en todas tus partidas, tarjetas y tablas.</p>
        </fieldset>
      )}
      {!asOrganizer && <ImageField name="logo" label="Foto de perfil (opcional)" />}

      <label className="block">
        <span className="label">{asOrganizer ? 'Descripción del organizador' : 'Biografía'} (opcional)</span>
        <textarea name="description" rows={3} maxLength={1000} className="input" />
      </label>

      <FormMessage state={state} />
      <SubmitButton pending={pending} className="btn-primary w-full" pendingText="Creando cuenta…">
        Crear cuenta
      </SubmitButton>
    </form>
  );
}

function Field({
  name,
  label,
  type = 'text',
  required = true,
  hint,
  ...rest
}: { name: string; label: string; type?: string; required?: boolean; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input name={name} type={type} required={required} className="input" {...rest} />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
