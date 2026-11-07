'use client';

import { loginAction } from '@/app/actions';
import { FormMessage, SubmitButton, usePersistentAction } from '@/components/forms';

export function LoginForm({ next }: { next?: string }) {
  const [state, onSubmit, pending] = usePersistentAction(loginAction, {});
  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <input type="hidden" name="next" value={next ?? ''} />
      <label className="block">
        <span className="label">Correo o usuario</span>
        <input name="identifier" required autoComplete="username" className="input" />
      </label>
      <label className="block">
        <span className="label">Contraseña</span>
        <input name="password" type="password" required autoComplete="current-password" className="input" />
      </label>
      <FormMessage state={state} />
      <SubmitButton pending={pending} className="btn-primary w-full" pendingText="Ingresando…">
        Ingresar
      </SubmitButton>
    </form>
  );
}
