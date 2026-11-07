import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/session';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Ingresar' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
  if (await getMe()) redirect(safe);
  return (
    <div className="mx-auto max-w-md py-10">
      <div className="card p-8">
        <h1 className="text-3xl font-bold uppercase">Ingresar</h1>
        <p className="mt-1 text-sm text-muted">Accede a tu panel, tus partidas y tus inscripciones.</p>
        <LoginForm next={safe} />
        <p className="mt-6 text-center text-sm text-muted">
          ¿No tienes cuenta?{' '}
          <Link href="/registro" className="font-semibold text-neon hover:underline">
            Regístrate gratis
          </Link>
        </p>
      </div>
    </div>
  );
}
