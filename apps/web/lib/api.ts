import 'server-only';
import { cookies } from 'next/headers';

export const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4100';
export const ACCESS_COOKIE = 'arena_at';
export const REFRESH_COOKIE = 'arena_rt';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: Record<string, unknown> = {},
  ) {
    super(message);
  }
  /** El backend devolvió un límite del plan SaaS (mostrar CTA de actualización). */
  get isPlanLimit() {
    return this.body.error === 'PLAN_LIMIT';
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

export function qs(query?: Query) {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/**
 * Llama a la API REST desde el servidor (Server Components / Server Actions).
 * Adjunta el JWT de la cookie httpOnly; el navegador nunca maneja el refresh token.
 */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown; query?: Query; form?: FormData; auth?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.auth !== false) {
    const token = (await cookies()).get(ACCESS_COOKIE)?.value;
    if (token) headers.authorization = `Bearer ${token}`;
  }
  let body: BodyInit | undefined;
  if (init.form) body = init.form;
  else if (init.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(init.body);
  }
  const res = await fetch(`${API_URL}/api${path}${qs(init.query)}`, {
    method: init.method ?? 'GET',
    headers,
    body,
    cache: 'no-store',
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join('. ') : (data?.message ?? 'Error inesperado');
    throw new ApiError(res.status, msg, data ?? {});
  }
  return data as T;
}

/** Variante que devuelve null en 404/401 (útil para páginas públicas y sesión opcional). */
export async function apiOrNull<T>(path: string, init?: Parameters<typeof api>[1]): Promise<T | null> {
  try {
    return await api<T>(path, init);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 401)) return null;
    throw e;
  }
}
