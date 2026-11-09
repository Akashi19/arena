import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { FORMAT_LABEL, formatChange, formatDate, formatPercent, MODE_LABEL, STATS_PERIOD_LABEL, STATUS_LABEL } from '@/lib/format';
import type { StatsOverview, StatsTournamentRow } from '@/lib/types';

const NUM = new Intl.NumberFormat('es-PE');
export const fmtNum = (n: number) => NUM.format(n);

/** Selector de periodo como enlaces (funciona sin JavaScript y se puede compartir). */
export function PeriodPicker({ current, hrefFor, options = [1, 3, 6, 12] }: { current: number; hrefFor: (m: number) => string; options?: number[] }) {
  return (
    <nav className="flex flex-wrap gap-1.5" aria-label="Periodo">
      {options.map((m) => (
        <Link
          key={m}
          href={hrefFor(m)}
          aria-current={m === current ? 'page' : undefined}
          className={`chip text-xs ${m === current ? 'border-neon text-neon' : 'hover:text-ink'}`}
        >
          {STATS_PERIOD_LABEL[m]}
        </Link>
      ))}
    </nav>
  );
}

/** Indicador con su variación frente al periodo anterior (la flecha indica sentido, no si es bueno o malo). */
export function KpiDelta({ label, value, change, hint }: { label: string; value: string; change?: number | null; hint?: string }) {
  const text = formatChange(change);
  const Icon = change === null || change === undefined || Math.abs(change) < 0.005 ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="card min-w-0 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
        {text ? (
          <>
            <Icon className="size-3.5 shrink-0" aria-hidden />
            <span>
              <span className="font-semibold text-ink">{text}</span> vs. periodo anterior
            </span>
          </>
        ) : (
          (hint ?? 'Sin datos del periodo anterior')
        )}
      </p>
    </div>
  );
}

/** Barras horizontales de un solo tono con el valor escrito (la barra solo refuerza la lectura). */
export function ShareBars({ rows, empty }: { rows: { label: string; value: number; detail?: string }[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label} className="min-w-0">
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="shrink-0 tabular-nums">
              <span className="font-semibold">{fmtNum(r.value)}</span>
              {r.detail && <span className="text-muted"> · {r.detail}</span>}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <div className="h-full rounded-full bg-neon" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function formatRows(byFormat: StatsOverview['byFormat']) {
  return byFormat.map((f) => ({ label: `${FORMAT_LABEL[f.format]} · ${MODE_LABEL[f.mode].toLowerCase()}`, value: f.tournaments }));
}

export function TopParticipantsTable({ rows, compact = false }: { rows: StatsOverview['top']; compact?: boolean }) {
  if (!rows.length) return <p className="text-sm text-muted">Todavía no hay encuentros jugados en este periodo.</p>;
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <caption className="sr-only">Participantes con más victorias</caption>
        <thead className="text-left text-[11px] uppercase tracking-wider text-muted print:text-black/60">
          <tr>
            <th scope="col" className="w-8 py-2 font-semibold">#</th>
            <th scope="col" className="py-2 font-semibold">Participante</th>
            <th scope="col" className="py-2 text-right font-semibold">Jugados</th>
            <th scope="col" className="py-2 text-right font-semibold">Victorias</th>
            <th scope="col" className="py-2 text-right font-semibold">% victorias</th>
            <th scope="col" className="py-2 text-right font-semibold">Títulos</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, compact ? 5 : rows.length).map((p, i) => (
            <tr key={p.id} className="border-t border-line">
              <td className="py-2 tabular-nums text-muted">{i + 1}</td>
              <td className="py-2 pr-3">
                {p.kind === 'TEAM' && p.slug ? (
                  <Link href={`/equipos/${p.slug}`} className="font-semibold hover:text-neon print:text-black">
                    {p.name}
                  </Link>
                ) : (
                  <span className="font-semibold">{p.name}</span>
                )}
                <span className="ml-2 text-xs text-muted">{p.kind === 'TEAM' ? 'Equipo' : 'Jugador'}</span>
              </td>
              <td className="py-2 text-right tabular-nums">{p.played}</td>
              <td className="py-2 text-right font-semibold tabular-nums">{p.wins}</td>
              <td className="py-2 text-right tabular-nums">{formatPercent(p.winRate)}</td>
              <td className="py-2 text-right tabular-nums">{p.titles || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TournamentPerformanceTable({ rows }: { rows: StatsTournamentRow[] }) {
  if (!rows.length) return <p className="text-sm text-muted">No hay partidas que empiecen en este periodo.</p>;
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">Rendimiento por partida</caption>
        <thead className="text-left text-[11px] uppercase tracking-wider text-muted print:text-black/60">
          <tr>
            <th scope="col" className="py-2 font-semibold">Partida</th>
            <th scope="col" className="py-2 font-semibold">Inicio</th>
            <th scope="col" className="py-2 font-semibold">Ocupación</th>
            <th scope="col" className="py-2 font-semibold">Encuentros</th>
            <th scope="col" className="py-2 text-right font-semibold">Pendientes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-t border-line align-top">
              <td className="py-2.5 pr-3">
                <Link href={`/dashboard/torneos/${t.id}`} className="font-semibold hover:text-neon print:text-black">
                  {t.name}
                </Link>
                <span className="block text-xs text-muted">
                  {STATUS_LABEL[t.status]} · {FORMAT_LABEL[t.format]}
                </span>
              </td>
              <td className="py-2.5 pr-3 text-muted">{formatDate(t.startsAt)}</td>
              <td className="py-2.5 pr-3">
                <Progress value={t.occupancyRate} label={`${t.approved}/${t.maxParticipants}`} />
              </td>
              <td className="py-2.5 pr-3">
                {t.matchesTotal ? <Progress value={t.progress} label={`${t.matchesCompleted}/${t.matchesTotal}`} /> : <span className="text-muted">Sin fixture</span>}
              </td>
              <td className="py-2.5 text-right tabular-nums">{t.pending || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Progress({ value, label }: { value: number | null; label: string }) {
  return (
    <div className="flex min-w-32 items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <div className="h-full rounded-full bg-neon" style={{ width: `${Math.min(1, value ?? 0) * 100}%` }} />
      </div>
      <span className="text-xs tabular-nums">
        {label} <span className="text-muted">({formatPercent(value)})</span>
      </span>
    </div>
  );
}

/** Series mensuales listas para MetricChart. */
export function monthlyMetrics(monthly: StatsOverview['monthly']) {
  return {
    months: monthly.map((m) => m.month),
    metrics: [
      { key: 'registrations', label: 'Inscripciones', values: monthly.map((m) => m.registrations) },
      { key: 'approved', label: 'Aprobadas', values: monthly.map((m) => m.approved) },
      { key: 'matches', label: 'Encuentros jugados', values: monthly.map((m) => m.matches) },
      { key: 'tournaments', label: 'Partidas creadas', values: monthly.map((m) => m.tournaments) },
    ],
  };
}
