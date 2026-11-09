'use client';

import { useState } from 'react';

const MONTH = new Intl.DateTimeFormat('es-PE', { month: 'short', timeZone: 'UTC' });
const MONTH_LONG = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const NUM = new Intl.NumberFormat('es-PE');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const date = (m: string) => new Date(`${m}-01T00:00:00Z`);

export interface Metric {
  key: string;
  label: string;
  values: number[];
}

/**
 * Barras mensuales de una sola serie a la vez: se elige la métrica con los botones (un solo tono, sin leyenda,
 * el botón activo nombra la serie). Detalle al pasar el cursor o con el teclado y tabla equivalente para
 * lectores de pantalla con todas las métricas.
 */
export function MetricChart({ months, metrics, caption }: { months: string[]; metrics: Metric[]; caption: string }) {
  const [metricKey, setMetricKey] = useState(metrics[0]!.key);
  const [active, setActive] = useState<number | null>(null);
  const metric = metrics.find((m) => m.key === metricKey) ?? metrics[0]!;
  const max = Math.max(...metric.values, 0);
  const shown = active ?? months.length - 1;
  const total = metric.values.reduce((a, b) => a + b, 0);

  return (
    <div className="relative min-w-0 overflow-hidden">
      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Métrica del gráfico">
        {metrics.map((m) => (
          <button
            key={m.key}
            type="button"
            aria-pressed={m.key === metric.key}
            onClick={() => setMetricKey(m.key)}
            className={`chip text-xs ${m.key === metric.key ? 'border-neon text-neon' : 'hover:text-ink'}`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="mb-3 flex flex-wrap justify-between gap-x-4 text-sm" aria-live="polite">
        <span>
          <span className="text-muted">{cap(MONTH_LONG.format(date(months[shown]!)))}: </span>
          <span className="font-semibold tabular-nums">{NUM.format(metric.values[shown] ?? 0)}</span>
        </span>
        <span className="text-muted">
          Total del periodo: <span className="font-semibold tabular-nums text-ink">{NUM.format(total)}</span>
        </span>
      </p>
      <div className="relative h-40 border-b border-line" aria-hidden>
        <div className="flex h-full items-end gap-1 sm:gap-2">
          {metric.values.map((v, i) => (
            <div
              key={months[i]}
              className="flex h-full flex-1 cursor-default items-end justify-center"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              <div
                className={`w-full max-w-12 rounded-t-[4px] transition-colors ${i === shown ? 'bg-neon' : 'bg-neon/45'}`}
                style={{ height: max ? `${Math.max((v / max) * 100, v > 0 ? 2 : 0)}%` : 0 }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 flex gap-1 sm:gap-2" aria-hidden>
        {months.map((m, i) => (
          <span key={m} className={`flex-1 text-center text-[10px] text-muted ${i % 2 && months.length > 8 ? 'hidden sm:block' : ''}`}>
            {MONTH.format(date(m)).replace('.', '')}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Mes</th>
            {metrics.map((m) => (
              <th key={m.key} scope="col">
                {m.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {months.map((month, i) => (
            <tr key={month}>
              <th scope="row">{MONTH_LONG.format(date(month))}</th>
              {metrics.map((m) => (
                <td key={m.key}>{m.values[i]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
