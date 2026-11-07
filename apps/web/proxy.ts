import { NextResponse, type NextRequest } from 'next/server';

const ACCESS = 'arena_at';
const REFRESH = 'arena_rt';
const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4100';
const PROTECTED = ['/dashboard', '/notificaciones'];

function expiresSoon(token?: string) {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now() + 30_000;
  } catch {
    return true;
  }
}

/**
 * Renueva el JWT de acceso de forma transparente usando el refresh token (cookie httpOnly)
 * y protege las rutas privadas con una comprobación optimista. La autorización real
 * siempre la hace la API.
 */
export async function proxy(request: NextRequest) {
  const access = request.cookies.get(ACCESS)?.value;
  const refresh = request.cookies.get(REFRESH)?.value;
  const isProtected = PROTECTED.some((p) => request.nextUrl.pathname.startsWith(p));

  if (expiresSoon(access) && refresh) {
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
        cache: 'no-store',
      });
      if (res.ok) {
        const tokens = (await res.json()) as { accessToken: string; refreshToken: string };
        // Reenvía las cookies nuevas a la request actual (SSR) y al navegador
        request.cookies.set(ACCESS, tokens.accessToken);
        request.cookies.set(REFRESH, tokens.refreshToken);
        const response = NextResponse.next({ request: { headers: request.headers } });
        const secure = process.env.NODE_ENV === 'production';
        response.cookies.set(ACCESS, tokens.accessToken, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 60 * 15 });
        response.cookies.set(REFRESH, tokens.refreshToken, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: 60 * 60 * 24 * 30 });
        return response;
      }
      if (res.status === 401) {
        const response = isProtected
          ? NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(request.nextUrl.pathname)}`, request.url))
          : NextResponse.next();
        response.cookies.delete(ACCESS);
        response.cookies.delete(REFRESH);
        return response;
      }
    } catch {
      // API caída: se deja continuar; las páginas mostrarán el error correspondiente
    }
  }

  if (isProtected && !access && !refresh) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(request.nextUrl.pathname)}`, request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|webp|ico)$).*)'],
};
