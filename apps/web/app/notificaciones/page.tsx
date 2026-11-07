import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';
import { requireMe } from '@/lib/session';
import type { Notification, Paginated } from '@/lib/types';
import { formatDateTime } from '@/lib/format';
import { markAllReadAction } from '@/app/actions';
import { EmptyState } from '@/components/ui';

export const metadata: Metadata = { title: 'Notificaciones' };

export default async function NotificationsPage() {
  await requireMe('/notificaciones');
  const data = await api<Paginated<Notification> & { unread: number }>('/me/notifications', { query: { pageSize: 50 } });
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
    </div>
  );
}
