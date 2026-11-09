import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { ACCESS_COOKIE, API_URL } from '@/lib/api';

/**
 * Descarga de CSV: el navegador no tiene el JWT (cookie httpOnly), así que esta ruta lo adjunta y reenvía el
 * archivo tal como lo genera la API. Los permisos y el plan los valida la API.
 */
export async function GET(req: NextRequest, ctx: RouteContext<'/dashboard/estadisticas/exportar/[kind]'>) {
  const { kind } = await ctx.params;
  const months = req.nextUrl.searchParams.get('meses') ?? '6';
  const back = (error: string) =>
    Response.redirect(new URL(`/dashboard/estadisticas?meses=${encodeURIComponent(months)}&error=${encodeURIComponent(error)}`, req.url), 303);

  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return Response.redirect(new URL('/login?next=/dashboard/estadisticas', req.url), 303);

  const res = await fetch(`${API_URL}/api/me/dashboard/export/${encodeURIComponent(kind)}?months=${encodeURIComponent(months)}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
    const msg = Array.isArray(body?.message) ? body.message.join('. ') : body?.message;
    return back(msg ?? 'No se pudo generar el archivo');
  }
  return new Response(res.body, {
    headers: {
      'content-type': res.headers.get('content-type') ?? 'text/csv; charset=utf-8',
      'content-disposition': res.headers.get('content-disposition') ?? 'attachment; filename="arena.csv"',
      'cache-control': 'no-store',
    },
  });
}
