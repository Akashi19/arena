'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Línea temporal para la evolución del ranking (puntos o posición). Un solo eje; la posición se dibuja
 * invertida (1 arriba). Colores: pasos oscuros de la paleta categórica de referencia, validados contra la
 * superficie de la app (#0e1018) para pares adyacentes. Leyenda + etiqueta directa al final de cada serie
 * y tooltip con línea guía al pasar el cursor.
 */
export const SERIES_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500'];

export interface ChartSeries {
  id: string;
  label: string;
  points: { x: string; y: number }[];
}

const H = 200;
const PAD = { top: 14, right: 16, bottom: 26, left: 44 };

function niceTicks(min: number, max: number, count = 4) {
  if (min === max) return [min];
  const step0 = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('es', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function RankingChart({
  series,
  invert = false,
  valueLabel,
  title,
}: {
  series: ChartSeries[];
  invert?: boolean;
  valueLabel: string;
  title: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Medida inicial inmediata (el observer solo notifica en frames pintados) y luego en cada cambio
    setWidth(Math.max(260, Math.round(el.getBoundingClientRect().width)));
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const xs = useMemo(() => [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort(), [series]);
  const values = series.flatMap((s) => s.points.map((p) => p.y));
  const multi = series.length > 1;
  const labelRoom = multi ? 74 : 0;
  const innerW = width - PAD.left - PAD.right - labelRoom;
  const innerH = H - PAD.top - PAD.bottom;

  if (!values.length) return <p className="text-sm text-muted">Aún no hay snapshots para dibujar la evolución.</p>;

  let min = Math.min(...values);
  let max = Math.max(...values);
  if (invert) min = Math.max(1, min);
  if (!invert) min = Math.min(0, min);
  if (min === max) max = min + 1;
  const ticks = niceTicks(min, max).filter((t) => !invert || (t >= 1 && Number.isInteger(t)));
  const x = (i: number) => PAD.left + (xs.length === 1 ? innerW / 2 : (i / (xs.length - 1)) * innerW);
  const y = (v: number) => PAD.top + (invert ? (v - min) / (max - min) : 1 - (v - min) / (max - min)) * innerH;
  const fmt = (v: number) => (invert ? `#${v}` : new Intl.NumberFormat('es').format(v));

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left;
    let best = 0;
    xs.forEach((_, i) => {
      if (Math.abs(x(i) - PAD.left - px) < Math.abs(x(best) - PAD.left - px)) best = i;
    });
    setHover(best);
  };

  const hx = hover !== null ? x(hover) : 0;
  const hoverRows = hover !== null ? series.map((s, i) => ({ s, i, p: s.points.find((p) => p.x === xs[hover]) })).filter((r) => r.p) : [];

  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">{title}</span>
        {multi && (
          <span className="flex flex-wrap gap-3 text-xs text-muted">
            {series.map((s, i) => (
              <span key={s.id} className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded" style={{ background: SERIES_COLORS[i] }} aria-hidden />
                {s.label}
              </span>
            ))}
          </span>
        )}
      </figcaption>
      <div ref={ref} className="relative">
        <svg width={width} height={H} role="img" aria-label={`${title}: ${valueLabel} por fecha`} className="block max-w-full">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + innerW} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--color-muted)" className="tabular-nums">
                {fmt(t)}
              </text>
            </g>
          ))}
          {[0, xs.length - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => (
            <text key={i} x={x(i)} y={H - 8} textAnchor={xs.length === 1 ? 'middle' : i === 0 ? 'start' : 'end'} fontSize={11} fill="var(--color-muted)">
              {shortDate(xs[i])}
            </text>
          ))}
          {series.map((s, si) => {
            const pts = s.points.map((p) => [x(xs.indexOf(p.x)), y(p.y)] as const);
            const last = pts[pts.length - 1];
            return (
              <g key={s.id}>
                {pts.length > 1 && (
                  <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={SERIES_COLORS[si]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                )}
                {last && <circle cx={last[0]} cy={last[1]} r={4} fill={SERIES_COLORS[si]} stroke="var(--color-surface)" strokeWidth={2} />}
                {multi && last && (
                  <text x={last[0] + 8} y={last[1]} dy="0.32em" fontSize={11} fill="var(--color-ink)">
                    {s.label.length > 9 ? `${s.label.slice(0, 8)}…` : s.label}
                  </text>
                )}
              </g>
            );
          })}
          {hover !== null && (
            <g pointerEvents="none">
              <line x1={hx} x2={hx} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--color-muted)" strokeWidth={1} strokeDasharray="3 3" />
              {hoverRows.map(({ s, i, p }) => (
                <circle key={s.id} cx={hx} cy={y(p!.y)} r={4} fill={SERIES_COLORS[i]} stroke="var(--color-surface)" strokeWidth={2} />
              ))}
            </g>
          )}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={innerW}
            height={innerH}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
        {hover !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 rounded-lg border border-line bg-surface-3 px-2.5 py-1.5 text-xs shadow-lg"
            style={{ left: Math.min(Math.max(hx - 60, 0), width - 150) }}
          >
            <p className="font-semibold">{shortDate(xs[hover])}</p>
            {hoverRows.map(({ s, i, p }) => (
              <p key={s.id} className="flex items-center gap-1.5 tabular-nums">
                <span className="size-2 rounded-full" style={{ background: SERIES_COLORS[i] }} aria-hidden />
                {multi && <span className="text-muted">{s.label}:</span>} {fmt(p!.y)} {!invert && <span className="text-muted">pts</span>}
              </p>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}
