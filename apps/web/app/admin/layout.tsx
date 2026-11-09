import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireMe } from '@/lib/session';
import { AdminNav } from './admin-nav';

export const metadata: Metadata = { title: { default: 'Administración', template: '%s · Administración · Arena' } };

/** Panel SUPERADMIN. La API vuelve a validar el rol en cada endpoint (esta comprobación es solo de interfaz). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMe('/admin');
  if (me.role !== 'SUPERADMIN') notFound();
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-neon-2">SUPERADMIN</p>
        <h1 className="section-title">Administración</h1>
      </div>
      <AdminNav />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
