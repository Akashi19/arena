'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin/rankings', label: 'Configuración' },
  { href: '/admin/rankings/revision', label: 'Revisión y correcciones' },
];

export function RankingAdminTabs() {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={pathname === t.href ? 'btn-primary px-3 py-1.5 text-sm' : 'btn-ghost px-3 py-1.5 text-sm'}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
