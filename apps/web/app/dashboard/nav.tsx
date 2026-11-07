'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { CreditCard, LayoutDashboard, ListChecks, PlusCircle, Shield, Trophy, UserCog, Users } from 'lucide-react';

export function DashboardNav({ isOrganizer }: { isOrganizer: boolean }) {
  const pathname = usePathname();
  const items = [
    { href: '/dashboard', label: 'Resumen', icon: LayoutDashboard, exact: true },
    ...(isOrganizer
      ? [
          { href: '/dashboard/torneos', label: 'Mis partidas', icon: Trophy },
          { href: '/dashboard/torneos/nuevo', label: 'Crear partida', icon: PlusCircle },
        ]
      : []),
    { href: '/dashboard/equipos', label: 'Equipos', icon: Users },
    { href: '/dashboard/inscripciones', label: 'Mis inscripciones', icon: ListChecks },
    { href: '/dashboard/perfil', label: 'Perfil y logo', icon: UserCog },
    ...(isOrganizer ? [{ href: '/dashboard/suscripcion', label: 'Mi suscripción', icon: CreditCard }] : []),
  ];
  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || (pathname.startsWith(href + '/') && !(href === '/dashboard/torneos' && pathname === '/dashboard/torneos/nuevo'));

  return (
    <nav aria-label="Panel" className="min-w-0 lg:sticky lg:top-20 lg:self-start">
      <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
        {items.map(({ href, label, icon: Icon, exact }) => (
          <li key={href} className="shrink-0">
            <Link
              href={href}
              className={clsx(
                'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                isActive(href, exact) ? 'bg-neon/10 text-neon ring-1 ring-neon/40' : 'text-muted hover:bg-surface-2 hover:text-ink',
              )}
            >
              <Icon className="size-4" /> {label}
            </Link>
          </li>
        ))}
      </ul>
      {!isOrganizer && (
        <Link href="/dashboard/perfil?activar=organizador" className="mt-4 hidden items-center gap-2 rounded-xl border border-neon-2/40 bg-neon-2/10 p-3 text-xs text-neon-2 lg:flex">
          <Shield className="size-4" /> Activa tu perfil de organizador
        </Link>
      )}
    </nav>
  );
}
