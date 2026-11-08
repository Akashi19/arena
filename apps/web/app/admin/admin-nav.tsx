'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/admin', label: 'Resumen', exact: true },
  { href: '/admin/verificaciones', label: 'Verificaciones' },
  { href: '/admin/valoraciones', label: 'Valoraciones' },
  { href: '/admin/incidencias', label: 'Incidencias' },
  { href: '/admin/reputacion', label: 'Reputación' },
  { href: '/admin/niveles', label: 'Niveles' },
  { href: '/admin/rankings', label: 'Rankings' },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1">
      {ITEMS.map((i) => {
        const active = i.exact ? pathname === i.href : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold ${active ? 'border-neon text-neon' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
