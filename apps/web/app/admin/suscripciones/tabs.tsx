'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin/suscripciones', label: 'Métricas' },
  { href: '/admin/suscripciones/suscriptores', label: 'Suscriptores' },
  { href: '/admin/suscripciones/pagos', label: 'Pagos' },
  { href: '/admin/suscripciones/inscripciones', label: 'Inscripciones cobradas' },
  { href: '/admin/suscripciones/planes', label: 'Planes' },
  { href: '/admin/suscripciones/promociones', label: 'Promociones' },
];

export function BillingTabs() {
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
