import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';
import { requireMe } from '@/lib/session';
import type { Notification, NotificationPreference, Paginated } from '@/lib/types';
import { formatDateTime } from '@/lib/format';
import { markAllReadAction } from '@/app/actions';
import { EmptyState } from '@/components/ui';
import { StreamNotificationPreferences } from './preferences';

export const metadata: Metadata = { title: 'Notificaciones' };

export default async function NotificationsPage() {
  await requireMe('/notificaciones');
  const [data, prefs] = await Promise.all([
    api<Paginated<Notification> & { unread: number }>('/me/notifications', { query: { pageSize: 50 } }),
    api<NotificationPreference[]>('/me/notification-preferences'),
  ]);
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="section-title">Notificaciones</h1>
        {data.unread > 0 && (
          <form action={markAllReadAction}>
            <button className="btn-ghost text-xs">Marcar todo como leído</button>
          </form>
        )}
      </div>
      {data.items.length ? (
        <ul className="space-y-2">
          {data.items.map((n) => {
            const body = (
              <div className={`card flex gap-3 p-4 ${n.readAt ? 'opacity-70' : 'border-neon/40'}`}>
                {!n.readAt && <span className="mt-2 size-2 shrink-0 rounded-full bg-neon" aria-label="Sin leer" />}
                <div className="min-w-0">
                  <p className="font-semibold">{n.title}</p>
                  <p className="text-sm text-muted">{n.body}</p>
                  <p className="mt-1 text-xs text-muted">{formatDateTime(n.createdAt)}</p>
                </div>
              </div>
            );
            return <li key={n.id}>{n.link ? <Link href={n.link}>{body}</Link> : body}</li>;
          })}
        </ul>
      ) : (
        <EmptyState title="No tienes notificaciones" />
      )}

      <section id="preferencias" className="card mt-8 space-y-3 p-5">
        <div>
          <h2 className="text-lg font-bold uppercase">Avisos de transmisiones</h2>
          <p className="text-sm text-muted">
            Te avisamos de las transmisiones de los torneos en los que participas. Los avisos en Arena llegan al instante; el envío por email y por
            WhatsApp (requiere un teléfono en tu perfil) queda guardado en tus preferencias y se activará al conectar esos canales.
          </p>
        </div>
        <StreamNotificationPreferences prefs={prefs} />
      </section>
    </div>
  );
}
