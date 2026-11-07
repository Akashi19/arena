import Link from 'next/link';
import clsx from 'clsx';
import { BadgeCheck, Star } from 'lucide-react';
import { initials, REPUTATION_LABEL, STATUS_LABEL } from '@/lib/format';
import type { OrganizerPublic, ReputationLevel, TournamentStatus } from '@/lib/types';
import { VerifiedBadge } from './verified-badge';

export function Avatar({
  src,
  name,
  size = 40,
  rounded = 'xl',
  accent,
}: {
  src?: string | null;
  name: string;
  size?: number;
  rounded?: 'xl' | 'full';
  accent?: string | null;
}) {
  const style = { width: size, height: size, ...(accent ? { boxShadow: `0 0 0 2px ${accent}` } : {}) };
  const cls = clsx('shrink-0 object-cover', rounded === 'full' ? 'rounded-full' : 'rounded-xl');
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name} width={size} height={size} className={clsx(cls, 'bg-surface-3')} style={style} />;
  }
  return (
    <span
      aria-label={name}
      className={clsx(cls, 'grid place-items-center bg-gradient-to-br from-surface-3 to-surface-2 font-display font-bold text-neon')}
      style={{ ...style, fontSize: size * 0.38 }}
    >
      {initials(name) || '?'}
    </span>
  );
}

const STATUS_STYLE: Record<TournamentStatus, string> = {
  DRAFT: 'border-muted/40 text-muted',
  OPEN: 'border-lime/50 bg-lime/10 text-lime',
  IN_PROGRESS: 'border-neon/50 bg-neon/10 text-neon',
  FINISHED: 'border-line bg-surface-3 text-muted',
  CANCELLED: 'border-danger/50 bg-danger/10 text-danger',
};

export function StatusBadge({ status }: { status: TournamentStatus }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold', STATUS_STYLE[status])}>
      {status === 'IN_PROGRESS' && <span className="size-1.5 animate-pulse rounded-full bg-neon" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Reputación: puntaje + nivel + tamaño de muestra (nunca se oculta una muestra pequeña). */
export function ReputationPill({
  reputation,
  compact = false,
}: {
  reputation: OrganizerPublic['reputation'];
  compact?: boolean;
}) {
  const level: ReputationLevel = reputation?.reputationLevel ?? 'NEW';
  const total = reputation?.totalRatings ?? 0;
  const score = Number(reputation?.averageScore ?? 0);
  if (total === 0) {
    return <span className="text-xs text-muted">{compact ? 'Sin valoraciones' : `${REPUTATION_LABEL.NEW} · sin valoraciones aún`}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted" title={REPUTATION_LABEL[level]}>
      <Star className="size-3.5 fill-amber text-amber" aria-hidden />
      <span className="font-semibold text-ink">{score.toFixed(2)}</span>
      <span>({total})</span>
      {!compact && <span>· {REPUTATION_LABEL[level]}</span>}
    </span>
  );
}

/** Logo + nombre del organizador + insignia de verificación + reputación. Se muestra en tarjetas y detalles. */
export function OrganizerTag({ organizer, size = 28, showReputation = true }: { organizer: OrganizerPublic; size?: number; showReputation?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Link href={`/organizer/${organizer.user.username}`} className="shrink-0">
        <Avatar src={organizer.logoUrl} name={organizer.displayName} size={size} accent={organizer.primaryColor} />
      </Link>
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <Link href={`/organizer/${organizer.user.username}`} className="truncate text-sm font-semibold hover:text-neon">
            {organizer.displayName}
          </Link>
          <VerifiedBadge organizer={organizer} />
        </div>
        {showReputation && <ReputationPill reputation={organizer.reputation} compact />}
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card grid place-items-center gap-3 px-6 py-14 text-center">
      <BadgeCheck className="size-8 text-neon/60" aria-hidden />
      <h3 className="text-xl font-bold">{title}</h3>
      {children && <p className="max-w-md text-sm text-muted">{children}</p>}
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, accent = 'neon' }: { label: string; value: React.ReactNode; hint?: string; accent?: 'neon' | 'neon-2' | 'lime' | 'amber' }) {
  const color = { neon: 'text-neon', 'neon-2': 'text-neon-2', lime: 'text-lime', amber: 'text-amber' }[accent];
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className={clsx('mt-1 font-display text-3xl font-bold tabular-nums', color)}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Pagination({ page, totalPages, hrefFor }: { page: number; totalPages: number; hrefFor: (p: number) => string }) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter((p) => Math.abs(p - page) <= 2 || p === 1 || p === totalPages);
  return (
    <nav aria-label="Paginación" className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
      {pages.map((p, i) => (
        <span key={p} className="flex items-center gap-1.5">
          {i > 0 && pages[i - 1]! < p - 1 && <span className="text-muted">…</span>}
          <Link
            href={hrefFor(p)}
            aria-current={p === page ? 'page' : undefined}
            className={clsx(
              'grid size-9 place-items-center rounded-lg border text-sm font-semibold',
              p === page ? 'border-neon bg-neon/10 text-neon' : 'border-line bg-surface-2 hover:border-neon/50',
            )}
          >
            {p}
          </Link>
        </span>
      ))}
    </nav>
  );
}
