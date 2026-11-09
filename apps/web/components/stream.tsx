import Link from 'next/link';
import clsx from 'clsx';
import { CalendarClock, ExternalLink, Lock, Radio, Tv } from 'lucide-react';
import type { FixtureEntrant, StreamListItem, StreamStatus } from '@/lib/types';
import { formatDateTime, STREAM_STATUS_LABEL } from '@/lib/format';
import { entrantName, formatScore } from '@/lib/fixture';
import { Avatar } from '@/components/ui';

const BADGE_STYLE: Record<StreamStatus, string> = {
  LIVE: 'border-danger/60 bg-danger/15 text-danger',
  SCHEDULED: 'border-amber/50 bg-amber/10 text-amber',
  ENDED: 'border-line bg-surface-3 text-muted',
  CANCELLED: 'border-line bg-surface-3 text-muted line-through',
  NOT_CONFIGURED: 'border-line text-muted',
};

/** Etiqueta del estado: EN VIVO / PRÓXIMAMENTE / FINALIZADA (siempre con texto, nunca solo color). */
export function StreamBadge({ status, className }: { status: StreamStatus; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide',
        BADGE_STYLE[status],
        className,
      )}
    >
      {status === 'LIVE' ? <Radio className="size-3 animate-pulse" aria-hidden /> : <Tv className="size-3" aria-hidden />}
      {STREAM_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * "Ver transmisión": abre la URL original (ya validada por la API: HTTPS y dominio autorizado) en una
 * pestaña nueva, sin pasar `window.opener` ni el referer completo.
 */
export function WatchLink({ url, platformName, className, compact = false }: { url: string; platformName: string; className?: string; compact?: boolean }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      referrerPolicy="strict-origin-when-cross-origin"
      className={clsx(compact ? 'btn-ghost px-2 py-1 text-xs' : 'btn-primary', className)}
      aria-label={`Ver transmisión en ${platformName} (se abre en una pestaña nueva)`}
    >
      <ExternalLink className={compact ? 'size-3' : 'size-4'} aria-hidden />
      Ver transmisión
    </a>
  );
}

export function PrivateNote({ compact = false }: { compact?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 text-muted', compact ? 'text-[11px]' : 'text-sm')}>
      <Lock className="size-3" aria-hidden /> Transmisión privada para los participantes
    </span>
  );
}

const nameOf = (e?: FixtureEntrant) => entrantName(e);

/** Tarjeta de un encuentro transmitido (listas de torneo y de /transmisiones). */
export function StreamCard({ item, showTournament = true }: { item: StreamListItem; showTournament?: boolean }) {
  const [home, away] = [1, 2].map((s) => item.match.participants.find((p) => p.slot === s));
  const team = item.tournament.mode === 'TEAM';
  const done = item.match.status === 'COMPLETED';
  const when = item.status === 'LIVE' ? item.actualStartAt : item.status === 'ENDED' ? (item.actualStartAt ?? item.scheduledStartAt) : item.scheduledStartAt;
  return (
    <article className={clsx('card flex min-w-0 flex-col gap-3 p-4', item.status === 'LIVE' && 'border-danger/50')}>
      <div className="flex flex-wrap items-center gap-2">
        <StreamBadge status={item.status} />
        <span className="text-xs text-muted">{item.platformName}</span>
        {item.isRebroadcast && <span className="chip text-[11px]">Retransmisión</span>}
      </div>
      <Link href={`/encuentros/${item.match.id}`} className="group block min-w-0">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
          <span className="flex min-w-0 items-center justify-end gap-2 text-right">
            <span className="truncate font-semibold group-hover:text-neon">{nameOf(home?.registration)}</span>
            {home && <Avatar src={home.registration.team?.logoUrl ?? home.registration.player?.avatarUrl} name={nameOf(home.registration)} size={26} rounded={team ? 'xl' : 'full'} />}
          </span>
          <span className="rounded-md bg-surface-3 px-2 py-0.5 font-display font-bold tabular-nums">
            {done ? `${formatScore(home?.score ?? null)} - ${formatScore(away?.score ?? null)}` : 'vs'}
          </span>
          <span className="flex min-w-0 items-center gap-2">
            {away && <Avatar src={away.registration.team?.logoUrl ?? away.registration.player?.avatarUrl} name={nameOf(away.registration)} size={26} rounded={team ? 'xl' : 'full'} />}
            <span className="truncate font-semibold group-hover:text-neon">{nameOf(away?.registration)}</span>
          </span>
        </div>
        {item.title && <p className="mt-2 truncate text-center text-xs text-muted">{item.title}</p>}
      </Link>
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted">
        {showTournament && (
          <Link href={`/torneos/${item.tournament.slug}`} className="min-w-0 truncate hover:text-ink">
            {item.tournament.game?.name ?? item.tournament.sport?.name} · {item.tournament.name}
          </Link>
        )}
        {when && (
          <span className="flex items-center gap-1">
            <CalendarClock className="size-3" aria-hidden /> {formatDateTime(when)}
          </span>
        )}
        <span className="ml-auto">
          {item.url ? <WatchLink url={item.url} platformName={item.platformName} compact /> : item.restricted ? <PrivateNote compact /> : null}
        </span>
      </div>
    </article>
  );
}
