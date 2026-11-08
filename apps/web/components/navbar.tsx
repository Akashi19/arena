import Link from 'next/link';
import { Swords } from 'lucide-react';
import { getMe, getSocketToken } from '@/lib/session';
import { logoutAction } from '@/app/actions';
import { NotificationBell } from './realtime';
import { Avatar } from './ui';
import { MobileMenu } from './mobile-menu';

const links = [
  { href: '/torneos', label: 'Torneos' },
  { href: '/torneos?category=ESPORT', label: 'eSports' },
  { href: '/torneos?category=SPORT', label: 'Deportes' },
  { href: '/jugadores', label: 'Jugadores' },
  { href: '/rankings', label: 'Rankings' },
  { href: '/organizadores', label: 'Organizadores' },
  { href: '/planes', label: 'Planes' },
];

export async function Navbar() {
  const me = await getMe();
  const token = me ? await getSocketToken() : null;
  const name = me?.organizerProfile?.displayName ?? me?.player?.nickname ?? me?.username ?? '';
  const image = me?.organizerProfile?.logoUrl ?? me?.profile.avatarUrl;

  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2" aria-label="Arena, inicio">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-neon to-neon-2 text-bg shadow-neon">
            <Swords className="size-5" />
          </span>
          <span className="font-display text-2xl font-bold uppercase tracking-widest">Arena</span>
        </Link>

        <nav className="ml-2 hidden items-center gap-0.5 lg:flex xl:ml-6 xl:gap-1">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium text-muted hover:bg-surface-2 hover:text-ink xl:px-3">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {me ? (
            <>
              <NotificationBell initialUnread={me.unreadNotifications} token={token} />
              <Link href="/dashboard" className="hidden items-center gap-2 rounded-xl border border-line bg-surface-2 py-1 pl-1 pr-3 hover:border-neon/60 sm:flex">
                <Avatar src={image} name={name} size={30} rounded="xl" />
                <span className="max-w-32 truncate text-sm font-semibold">{name}</span>
              </Link>
              <form action={logoutAction} className="hidden sm:block">
                <button className="btn-ghost px-3 py-2 text-xs">Salir</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost hidden px-3 py-2 sm:inline-flex">
                Ingresar
              </Link>
              <Link href="/registro" className="btn-primary px-3 py-2">
                Crear cuenta
              </Link>
            </>
          )}
          <MobileMenu links={links} loggedIn={!!me} />
        </div>
      </div>
    </header>
  );
}
