'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { logoutAction } from '@/app/actions';

export function MobileMenu({ links, loggedIn }: { links: { href: string; label: string }[]; loggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Se cierra al navegar (ajuste de estado durante el render)
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="grid size-10 place-items-center rounded-xl border border-line bg-surface-2"
        aria-expanded={open}
        aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
      {open && (
        <div className="fixed inset-x-0 top-16 z-50 border-b border-line bg-bg/95 p-4 backdrop-blur-xl">
          <nav className="grid gap-1">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-lg px-3 py-3 font-medium hover:bg-surface-2">
                {l.label}
              </Link>
            ))}
            {loggedIn ? (
              <>
                <Link href="/dashboard" className="rounded-lg px-3 py-3 font-medium text-neon hover:bg-surface-2">
                  Mi panel
                </Link>
                <form action={logoutAction}>
                  <button className="w-full rounded-lg px-3 py-3 text-left font-medium text-muted hover:bg-surface-2">Cerrar sesión</button>
                </form>
              </>
            ) : (
              <Link href="/login" className="rounded-lg px-3 py-3 font-medium text-neon hover:bg-surface-2">
                Ingresar
              </Link>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
