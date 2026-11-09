'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { io, type Socket } from 'socket.io-client';
import { Bell } from 'lucide-react';

const API_PUBLIC = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4100';

// Dos conexiones: una autenticada (sala personal de notificaciones) y otra pública (salas de torneos)
let personal: Socket | null = null;
let publicSocket: Socket | null = null;
function getPersonalSocket(token: string) {
  personal ??= io(`${API_PUBLIC}/realtime`, { transports: ['websocket'], auth: { token } });
  return personal;
}
function getPublicSocket() {
  publicSocket ??= io(`${API_PUBLIC}/realtime`, { transports: ['websocket'] });
  return publicSocket;
}

/** Campana con contador; se actualiza en vivo cuando llega una notificación por WebSocket. */
export function NotificationBell({ initialUnread, token }: { initialUnread: number; token: string | null }) {
  const [unread, setUnread] = useState(initialUnread);
  const [toast, setToast] = useState<{ title: string; body: string; link?: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sincroniza el contador cuando el servidor envía otro valor inicial (al navegar)
  const [lastInitial, setLastInitial] = useState(initialUnread);
  if (lastInitial !== initialUnread) {
    setLastInitial(initialUnread);
    setUnread(initialUnread);
  }

  useEffect(() => {
    if (!token) return;
    const s = getPersonalSocket(token);
    const onNotification = (n: { title: string; body: string; link?: string }) => {
      setUnread((u) => u + 1);
      setToast(n);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(null), 6000);
    };
    s.on('notification', onNotification);
    return () => {
      s.off('notification', onNotification);
    };
  }, [token]);

  return (
    <>
      <Link href="/notificaciones" className="relative grid size-10 place-items-center rounded-xl border border-line bg-surface-2 hover:border-neon/60" aria-label={`Notificaciones (${unread} sin leer)`}>
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-neon-2 px-1 text-[10px] font-bold text-bg">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Link>
      {toast && (
        <div role="status" className="fixed bottom-4 right-4 z-[60] w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-neon/40 bg-surface-2 p-4 shadow-neon">
          <p className="font-semibold">{toast.title}</p>
          <p className="mt-0.5 text-sm text-muted">{toast.body}</p>
          {toast.link && (
            <Link href={toast.link} className="mt-2 inline-block text-sm font-semibold text-neon" onClick={() => setToast(null)}>
              Ver
            </Link>
          )}
        </div>
      )}
    </>
  );
}

/**
 * Suscribe la página a la sala del torneo y refresca los datos del servidor
 * (inscritos, estado, horarios) sin recargar la página.
 */
export function TournamentLive({ tournamentId }: { tournamentId: string }) {
  const router = useRouter();
  useEffect(() => {
    const s = getPublicSocket();
    const join = () => s.emit('tournament:join', tournamentId);
    join();
    s.on('connect', join);
    let pending: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(pending);
      pending = setTimeout(() => router.refresh(), 300);
    };
    const events = ['registration:changed', 'tournament:updated', 'tournament:status', 'fixture:updated', 'match:updated', 'stream:updated'];
    events.forEach((e) => s.on(e, refresh));
    return () => {
      s.emit('tournament:leave', tournamentId);
      s.off('connect', join);
      events.forEach((e) => s.off(e, refresh));
      clearTimeout(pending);
    };
  }, [tournamentId, router]);
  return null;
}

/** Refresca las listas de transmisiones cuando un organizador cambia el estado o el enlace de alguna. */
export function StreamsLive() {
  const router = useRouter();
  useEffect(() => {
    const s = getPublicSocket();
    let pending: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      clearTimeout(pending);
      pending = setTimeout(() => router.refresh(), 500);
    };
    s.on('streams:changed', onChange);
    return () => {
      s.off('streams:changed', onChange);
      clearTimeout(pending);
    };
  }, [router]);
  return null;
}

/** Refresca la tabla de ranking cuando la API recalcula ese videojuego (`ranking:updated`). */
export function RankingLive({ gameId }: { gameId: string }) {
  const router = useRouter();
  useEffect(() => {
    const s = getPublicSocket();
    let pending: ReturnType<typeof setTimeout> | undefined;
    const onUpdate = (e: { gameId?: string }) => {
      if (e?.gameId !== gameId) return;
      clearTimeout(pending);
      pending = setTimeout(() => router.refresh(), 500);
    };
    s.on('ranking:updated', onUpdate);
    return () => {
      s.off('ranking:updated', onUpdate);
      clearTimeout(pending);
    };
  }, [gameId, router]);
  return null;
}
