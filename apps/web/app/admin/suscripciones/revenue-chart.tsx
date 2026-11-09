'use client';

import { useState } from 'react';
import { formatAmount } from '@/lib/format';

const MONTH = new Intl.DateTimeFormat('es-PE', { month: 'short', timeZone: 'UTC' });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const MONTH_LONG = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * Barras de una sola serie (ingresos por mes): un solo tono, sin leyenda (el título nombra la serie),
 * detalle al pasar el cursor o enfocar y tabla equivalente para lectores de pantalla.
 */
export function RevenueChart({ series, currency }: { series: { month: string; total: number }[]; currency: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...series.map((s) => s.total), 0);
  const label = (m: string) => MONTH.format(new Date(`${m}-01T00:00:00Z`)).replace('.', '');
  const shown = active ?? series.length - 1;

  return (
    <div>
      <p className="mb-3 h-5 text-sm" aria-live="polite">
        <span className="text-muted">{cap(MONTH_LONG.format(new Date(`${series[shown]!.month}-01T00:00:00Z`)))}: </span>
        <span className="font-semibold tabular-nums">{formatAmount(series[shown]!.total, currency)}</span>
      </p>
      <div className="relative h-40 border-b border-line" aria-hidden>
        <div className="flex h-full items-end gap-1 sm:gap-2">
          {series.map((s, i) => (
            <div
              key={s.month}
              className="group flex h-full flex-1 cursor-default items-end"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              <div
                className={`w-full rounded-t-[4px] transition-colors ${i === shown ? 'bg-neon' : 'bg-neon/45'}`}
                style={{ height: max ? `${Math.max((s.total / max) * 100, s.total > 0 ? 2 : 0)}%` : 0 }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 flex gap-1 sm:gap-2" aria-hidden>
        {series.map((s, i) => (
          <span key={s.month} className={`flex-1 text-center text-[10px] ${i % 2 && series.length > 8 ? 'hidden sm:block' : ''} text-muted`}>
            {label(s.month)}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Pagos cobrados por mes en {currency}</caption>
        <thead>
          <tr>
            <th scope="col">Mes</th>
            <th scope="col">Importe</th>
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.month}>
              <th scope="row">{MONTH_LONG.format(new Date(`${s.month}-01T00:00:00Z`))}</th>
              <td>{formatAmount(s.total, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
