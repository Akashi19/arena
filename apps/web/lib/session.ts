import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ACCESS_COOKIE, REFRESH_COOKIE, apiOrNull } from './api';
import type { Me } from './types';

/** Usuario actual (una sola llamada por request gracias a cache()). */
export const getMe = cache(async (): Promise<Me | null> => {
  const jar = await cookies();
  if (!jar.get(ACCESS_COOKIE)) return null;
  return apiOrNull<Me>('/auth/me');
});

export async function requireMe(next = '/dashboard') {
  const me = await getMe();
  if (!me) redirect(`/login?next=${encodeURIComponent(next)}`);
  return me;
}

export async function requireOrganizer(next = '/dashboard') {
  const me = await requireMe(next);
  if (!me.organizerProfile) redirect('/dashboard/perfil?activar=organizador');
  return me;
}

export async function setSessionCookies(tokens: { accessToken: string; refreshToken: string }) {
  const jar = await cookies();
  const secure = process.env.NODE_ENV === 'production';
  jar.set(ACCESS_COOKIE, tokens.accessToken, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 60 * 15 });
  jar.set(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookies() {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

/** Token de acceso para el socket en tiempo real (solo se usa para unirse a la sala personal). */
export async function getSocketToken() {
  return (await cookies()).get(ACCESS_COOKIE)?.value ?? null;
}
