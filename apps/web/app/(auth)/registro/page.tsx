import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/session';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Crear cuenta' };

export default async function RegisterPage() {
  if (await getMe()) redirect('/dashboard');
  return (
    <div className="mx-auto max-w-2xl py-6">
      <div className="card p-6 sm:p-8">
        <h1 className="text-3xl font-bold uppercase">Crear cuenta</h1>
        <p className="mt-1 text-sm text-muted">Organiza tus propios torneos o inscríbete para competir. Es gratis.</p>
        <RegisterForm />
        <p className="mt-6 text-center text-sm text-muted">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="font-semibold text-neon hover:underline">
            Ingresar
          </Link>
        </p>
      </div>
    </div>
  );
}
