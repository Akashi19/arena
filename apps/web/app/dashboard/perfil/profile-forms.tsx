'use client';

import { becomeOrganizerAction, changePasswordAction, logoutAllAction, updateOrganizerAction, updateProfileAction } from '@/app/actions';
import { COUNTRIES, ORGANIZER_TYPE_LABEL } from '@/lib/format';
import type { Me, OrganizerFull } from '@/lib/types';
import { FormMessage, SubmitButton, usePersistentAction } from '@/components/forms';

const SOCIALS = ['instagram', 'x', 'youtube', 'twitch', 'tiktok', 'facebook', 'discord', 'kick'];

export function OrganizerForm({ organizer, canCustomize }: { organizer: OrganizerFull; canCustomize: boolean }) {
  const [state, onSubmit, pending] = usePersistentAction(updateOrganizerAction, {});
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="label">Nombre público *</span>
          <input name="displayName" required minLength={2} maxLength={80} defaultValue={organizer.displayName} className="input" />
        </label>
        <label className="block">
          <span className="label">Razón social (opcional)</span>
          <input name="legalName" maxLength={120} defaultValue={organizer.legalName ?? ''} className="input" />
        </label>
        <label className="block">
          <span className="label">Tipo</span>
          <select name="organizerType" defaultValue={organizer.organizerType} className="input">
            {Object.entries(ORGANIZER_TYPE_LABEL).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Sitio web</span>
          <input name="website" type="url" placeholder="https://" defaultValue={organizer.website ?? ''} className="input" />
        </label>
        <label className="block">
          <span className="label">País</span>
          <select name="country" defaultValue={organizer.country} className="input">
            {Object.entries(COUNTRIES).map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Ciudad</span>
          <input name="city" required defaultValue={organizer.city} className="input" />
        </label>
        <label className="block md:col-span-2">
          <span className="label">Descripción</span>
          <textarea name="description" rows={3} maxLength={1000} defaultValue={organizer.description ?? ''} className="input" />
        </label>
        <label className="block">
          <span className="label">Color de marca {canCustomize ? '' : '(Pro)'}</span>
          <input name="primaryColor" type="color" disabled={!canCustomize} defaultValue={organizer.primaryColor ?? '#22d3ee'} className="h-11 w-24 cursor-pointer rounded-xl border border-line bg-surface-2 p-1 disabled:opacity-40" />
        </label>
      </div>
      <fieldset>
        <legend className="label">Redes sociales públicas (https)</legend>
        <div className="grid gap-2 md:grid-cols-2">
          {SOCIALS.map((s) => (
            <input key={s} name={`social_${s}`} type="url" placeholder={`${s} · https://…`} defaultValue={organizer.socialLinks?.[s] ?? ''} className="input" />
          ))}
        </div>
      </fieldset>
      <FormMessage state={state} />
      <SubmitButton pending={pending}>Guardar identidad</SubmitButton>
    </form>
  );
}

export function BecomeOrganizerForm({ defaultName }: { defaultName: string }) {
  const [state, onSubmit, pending] = usePersistentAction(becomeOrganizerAction, {});
  return (
    <form method="post" onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
      <label className="block">
        <span className="label">Nombre público *</span>
        <input name="displayName" required minLength={2} defaultValue={defaultName} className="input" />
      </label>
      <label className="block">
        <span className="label">Tipo</span>
        <select name="organizerType" className="input">
          {Object.entries(ORGANIZER_TYPE_LABEL).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </label>
      <label className="block md:col-span-2">
        <span className="label">Descripción</span>
        <textarea name="description" rows={2} maxLength={1000} className="input" />
      </label>
      <div className="md:col-span-2">
        <FormMessage state={state} />
        <SubmitButton pending={pending} className="btn-accent mt-2" pendingText="Activando…">Activar perfil de organizador</SubmitButton>
      </div>
    </form>
  );
}

export function ProfileForm({ me }: { me: Me }) {
  const [state, onSubmit, pending] = usePersistentAction(updateProfileAction, {});
  const p = me.profile;
  const privacy = p.privacy ?? {};
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="label">Nombres</span>
          <input name="firstName" required defaultValue={p.firstName} className="input" />
        </label>
        <label className="block">
          <span className="label">Apellidos</span>
          <input name="lastName" required defaultValue={p.lastName} className="input" />
        </label>
        <label className="block">
          <span className="label">Nickname / alias</span>
          <input name="nickname" defaultValue={me.player?.nickname ?? ''} minLength={2} maxLength={32} className="input" />
        </label>
        <label className="block">
          <span className="label">Correo (no editable)</span>
          <input value={me.email} disabled className="input opacity-60" readOnly />
        </label>
        <label className="block">
          <span className="label">País</span>
          <select name="country" defaultValue={p.country} className="input">
            {Object.entries(COUNTRIES).map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Ciudad</span>
          <input name="city" required defaultValue={p.city} className="input" />
        </label>
        <label className="block">
          <span className="label">Teléfono</span>
          <input name="phone" type="tel" defaultValue={p.phone ?? ''} className="input" />
        </label>
        <label className="block md:col-span-2">
          <span className="label">Biografía</span>
          <textarea name="bio" rows={3} maxLength={1000} defaultValue={p.bio ?? ''} className="input" />
        </label>
      </div>
      <fieldset>
        <legend className="label">Visibilidad en tu perfil público de jugador</legend>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          {[
            ['showRealName', 'Mostrar nombre real'],
            ['showCountry', 'Mostrar país'],
            ['showStats', 'Mostrar estadísticas'],
            ['showTeams', 'Mostrar equipos'],
            ['showHistory', 'Mostrar historial de torneos'],
          ].map(([k, label]) => (
            <label key={k} className="flex items-center gap-2">
              <input type="checkbox" name={k} defaultChecked={privacy[k] !== false} className="accent-[var(--color-neon)]" /> {label}
            </label>
          ))}
        </div>
      </fieldset>
      <FormMessage state={state} />
      <SubmitButton pending={pending}>Guardar datos</SubmitButton>
    </form>
  );
}

export function SecurityForm() {
  const [state, onSubmit, pending] = usePersistentAction(changePasswordAction, {});
  return (
    <div className="space-y-5">
      <form method="post" onSubmit={onSubmit} className="space-y-4" key={state.ok ? 'done' : 'edit'}>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="block">
            <span className="label">Contraseña actual</span>
            <input name="currentPassword" type="password" required autoComplete="current-password" className="input" />
          </label>
          <label className="block">
            <span className="label">Nueva contraseña</span>
            <input
              name="newPassword"
              type="password"
              required
              minLength={8}
              maxLength={72}
              pattern="(?=.*[A-Za-z])(?=.*\d).+"
              title="Entre 8 y 72 caracteres, con letras y números"
              autoComplete="new-password"
              className="input"
            />
          </label>
          <label className="block">
            <span className="label">Repite la nueva contraseña</span>
            <input name="confirmPassword" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="input" />
          </label>
        </div>
        <FormMessage state={state} />
        <SubmitButton pending={pending}>Cambiar contraseña</SubmitButton>
      </form>
      <form action={logoutAllAction} className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <p className="min-w-0 flex-1 basis-64 text-sm text-muted">¿Usaste tu cuenta en un equipo ajeno? Cierra la sesión en todos los dispositivos, incluido este.</p>
        <button className="btn-ghost">Cerrar todas las sesiones</button>
      </form>
    </div>
  );
}
