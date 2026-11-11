import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { ACCESS_COOKIE, API_URL } from '@/lib/api';

/**
 * Vuelta de la autorización OAuth de Mercado Pago. El código se canjea en la API con la sesión del organizador
 * (el state firmado impide conectar la cuenta en el espacio de otro usuario).
 */
export async function GET(req: NextRequest) {
  const back = (q: string) => Response.redirect(new URL(`/dashboard/cobros?${q}`, req.url), 303);
  const sp = req.nextUrl.searchParams;
  const code = sp.get('code');
  const state = sp.get('state');
  if (sp.get('error') || !code || !state) return back(`error=${encodeURIComponent('No se completó la autorización en Mercado Pago')}`);

  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return Response.redirect(new URL('/login?next=/dashboard/cobros', req.url), 303);

  const res = await fetch(`${API_URL}/api/me/payment-account/mercadopago/connect`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ code, state }),
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
    const msg = Array.isArray(body?.message) ? body.message.join('. ') : body?.message;
    return back(`error=${encodeURIComponent(msg ?? 'No se pudo conectar la cuenta de Mercado Pago')}`);
  }
  return back('conectado=1');
}
