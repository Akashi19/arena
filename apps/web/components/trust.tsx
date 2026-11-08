import Link from 'next/link';
import { AlertTriangle, MessageSquareReply, Star } from 'lucide-react';
import type { RatingItem, ReputationSummary } from '@/lib/types';
import { formatDate, formatDateTime, INCIDENT_TYPE_LABEL, RATING_CRITERIA, REPUTATION_LABEL } from '@/lib/format';
import { Avatar } from '@/components/ui';

/** Estrellas de solo lectura (admite medias). */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value.toFixed(2)} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <Star className="absolute inset-0 text-surface-3" style={{ width: size, height: size }} fill="currentColor" strokeWidth={0} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className="text-amber" style={{ width: size, height: size }} fill="currentColor" strokeWidth={0} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * Resumen de reputación. Verificación y reputación son indicadores independientes: este bloque nunca
 * mezcla el estado de verificación con la puntuación.
 */
export function ReputationOverview({ summary }: { summary: ReputationSummary }) {
  const r = summary.reputation;
  const score = Number(r.averageScore);
  const total = Object.values(summary.distribution).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="card flex flex-col items-center justify-center gap-2 p-5 text-center">
          <p className="font-display text-5xl font-bold tabular-nums">{r.totalRatings ? score.toFixed(2) : '—'}</p>
          <Stars value={score} size={20} />
          <p className="text-sm font-semibold text-neon">{REPUTATION_LABEL[r.reputationLevel]}</p>
          <p className="text-xs text-muted">
            {r.totalRatings} {r.totalRatings === 1 ? 'valoración válida' : 'valoraciones válidas'} · actualizado {formatDateTime(r.lastCalculatedAt)}
          </p>
          {summary.smallSample && (
            <p className="rounded-lg bg-surface-3 px-2 py-1 text-[11px] text-muted">
              Muestra pequeña: el nivel se consolida con 10 valoraciones y 5 torneos completados.
            </p>
          )}
        </div>
        <div className="card space-y-2.5 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Por criterio</p>
          {RATING_CRITERIA.map((c) => {
            const v = Number(r[c.avg]);
            return (
              <div key={c.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[180px_1fr_auto]">
                <span className="text-sm">
                  {c.label} <span className="text-[10px] text-muted">({c.weight})</span>
                </span>
                <span className="order-3 col-span-2 h-2 overflow-hidden rounded-full bg-surface-3 sm:order-none sm:col-span-1">
                  <span className="block h-full rounded-full bg-neon" style={{ width: `${(v / 5) * 100}%` }} />
                </span>
                <span className="text-right font-display text-sm font-bold tabular-nums">{r.totalRatings ? v.toFixed(2) : '—'}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-1.5 p-5">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Distribución de estrellas</p>
          {(['5', '4', '3', '2', '1'] as const).map((s) => {
            const n = summary.distribution[s];
            return (
              <div key={s} className="grid grid-cols-[2.5rem_1fr_2rem] items-center gap-2 text-sm">
                <span className="flex items-center gap-1 text-muted">
                  {s} <Star className="size-3 text-amber" fill="currentColor" strokeWidth={0} />
                </span>
                <span className="h-2 overflow-hidden rounded-full bg-surface-3">
                  <span className="block h-full rounded-full bg-amber" style={{ width: `${total ? (n / total) * 100 : 0}%` }} />
                </span>
                <span className="text-right text-xs tabular-nums text-muted">{n}</span>
              </div>
            );
          })}
        </div>
        <MonthlyChart monthly={summary.monthly} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Torneos completados" value={r.completedTournaments} />
        <Tile label="Cancelaciones computadas" value={r.cancelledTournaments} />
        <Tile label="Cumplimiento" value={r.dueTournaments ? `${Number(r.completionRate).toFixed(0)}%` : '—'} hint="completados / que debían finalizar" />
        <Tile label="Incidencias confirmadas" value={r.confirmedIncidents} warn={r.confirmedIncidents > 0} />
      </div>
    </div>
  );
}

function Tile({ label, value, hint, warn = false }: { label: string; value: string | number; hint?: string; warn?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className={`font-display text-2xl font-bold tabular-nums ${warn ? 'text-danger' : ''}`}>{value}</p>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

/** Evolución mensual: barras = cantidad de valoraciones, línea = promedio (escala 1-5). */
export function MonthlyChart({ monthly }: { monthly: ReputationSummary['monthly'] }) {
  const W = 360;
  const H = 140;
  const pad = { l: 22, r: 6, t: 10, b: 22 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const maxCount = Math.max(1, ...monthly.map((m) => m.count));
  const step = iw / monthly.length;
  const y = (avg: number) => pad.t + ih - ((avg - 1) / 4) * ih;
  const points = monthly
    .map((m, i) => (m.average === null ? null : `${pad.l + step * i + step / 2},${y(m.average)}`))
    .filter(Boolean)
    .join(' ');
  const MONTHS = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

  return (
    <div className="card p-5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Evolución de los últimos 12 meses</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Promedio y cantidad de valoraciones por mes">
        {[1, 3, 5].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-line" strokeDasharray="3 3" />
            <text x={pad.l - 6} y={y(v) + 3} textAnchor="end" className="fill-muted text-[9px]">
              {v}
            </text>
          </g>
        ))}
        {monthly.map((m, i) => {
          const h = (m.count / maxCount) * ih * 0.6;
          return (
            <g key={m.month}>
              <rect x={pad.l + step * i + step * 0.2} y={pad.t + ih - h} width={step * 0.6} height={h} rx={2} className="fill-neon-2/25">
                <title>{`${m.month}: ${m.count} valoraciones${m.average !== null ? `, promedio ${m.average}` : ''}`}</title>
              </rect>
              <text x={pad.l + step * i + step / 2} y={H - 6} textAnchor="middle" className="fill-muted text-[9px]">
                {MONTHS[Number(m.month.slice(5)) - 1]}
              </text>
            </g>
          );
        })}
        {points && <polyline points={points} fill="none" stroke="currentColor" strokeWidth={2} className="text-neon" />}
        {monthly.map((m, i) =>
          m.average === null ? null : <circle key={m.month} cx={pad.l + step * i + step / 2} cy={y(m.average)} r={3} className="fill-neon" />,
        )}
      </svg>
      <p className="mt-1 flex gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-3 bg-neon" /> Promedio
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-sm bg-neon-2/40" /> Cantidad
        </span>
      </p>
    </div>
  );
}

export function RatingCard({ rating, children }: { rating: RatingItem; children?: React.ReactNode }) {
  return (
    <article className="card space-y-2 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <Avatar src={rating.author.avatarUrl} name={rating.author.nickname} size={36} rounded="full" />
        <div className="min-w-0 flex-1">
          <Link href={`/jugadores/${rating.author.username}`} className="block truncate text-sm font-semibold hover:text-neon">
            {rating.author.nickname}
          </Link>
          <p className="truncate text-xs text-muted">
            <Link href={`/torneos/${rating.tournament.slug}`} className="hover:text-ink">
              {rating.tournament.name}
            </Link>{' '}
            · {formatDate(rating.createdAt)}
            {rating.updatedAt !== rating.createdAt && ' · editada'}
          </p>
        </div>
        <span className="flex items-center gap-2">
          <Stars value={Number(rating.finalScore)} size={14} />
          <span className="font-display font-bold tabular-nums">{Number(rating.finalScore).toFixed(2)}</span>
        </span>
      </header>
      {rating.comment && <p className="whitespace-pre-line text-sm text-ink/90">{rating.comment}</p>}
      {rating.response && (
        <div className="ml-4 rounded-xl border-l-2 border-neon/60 bg-surface-2 p-3 text-sm">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-neon">
            <MessageSquareReply className="size-3.5" /> Respuesta del organizador · {formatDate(rating.response.createdAt)}
          </p>
          <p className="whitespace-pre-line text-ink/90">{rating.response.response}</p>
        </div>
      )}
      {children}
    </article>
  );
}

export function IncidentList({ incidents }: { incidents: ReputationSummary['confirmedIncidents'] }) {
  if (!incidents.length) return <p className="card p-5 text-sm text-muted">Sin incidencias confirmadas.</p>;
  return (
    <ul className="space-y-2">
      {incidents.map((i) => (
        <li key={i.id} className="card flex gap-3 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {INCIDENT_TYPE_LABEL[i.incidentType]} ·{' '}
              <Link href={`/torneos/${i.tournament.slug}`} className="text-muted hover:text-ink">
                {i.tournament.name}
              </Link>
            </p>
            {i.resolution && <p className="text-sm text-muted">Resolución: {i.resolution}</p>}
            <p className="text-xs text-muted">Confirmada el {formatDate(i.resolvedAt ?? i.createdAt)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
