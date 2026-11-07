'use client';

import { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, SlidersHorizontal, X } from 'lucide-react';
import { COUNTRIES, FORMAT_LABEL } from '@/lib/format';
import type { Discipline } from '@/lib/types';

/** Filtros del listado: actualizan la URL (compartible) y los resultados sin recargar la página. */
export function TournamentFilters({ sports, games }: { sports: Discipline[]; games: Discipline[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(params.get('q') ?? '');

  useEffect(() => setQ(params.get('q') ?? ''), [params]);

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete('page');
    startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  // Búsqueda con debounce
  useEffect(() => {
    if (q === (params.get('q') ?? '')) return;
    const t = setTimeout(() => update({ q: q || null }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const v = (k: string) => params.get(k) ?? '';
  const category = v('category');
  const active = [...params.keys()].filter((k) => k !== 'page' && k !== 'sort').length;

  const select = (name: string, label: string, options: [string, string][]) => (
    <label className="block">
      <span className="label">{label}</span>
      <select className="input" value={v(name)} onChange={(e) => update({ [name]: e.target.value || null })}>
        <option value="">Todos</option>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <aside>
      <button type="button" className="btn-ghost mb-3 w-full lg:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <SlidersHorizontal className="size-4" /> Filtros {active > 0 && `(${active})`}
      </button>
      <div className={`card space-y-4 p-4 lg:sticky lg:top-20 lg:block ${open ? 'block' : 'hidden'}`}>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold uppercase">
            Filtros {pending && <Loader2 className="size-4 animate-spin text-neon" />}
          </h2>
          {active > 0 && (
            <button type="button" className="flex items-center gap-1 text-xs text-muted hover:text-neon" onClick={() => startTransition(() => router.push(pathname))}>
              <X className="size-3" /> Limpiar
            </button>
          )}
        </div>

        <label className="block">
          <span className="label">Buscar</span>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, torneo u organizador" />
        </label>

        <div>
          <span className="label">Categoría</span>
          <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface-2 p-1 text-xs font-semibold">
            {[
              ['', 'Todas'],
              ['ESPORT', 'eSports'],
              ['SPORT', 'Deportes'],
            ].map(([value, text]) => (
              <button
                key={value}
                type="button"
                onClick={() => update({ category: value || null, sport: null, game: null })}
                className={`rounded-lg py-1.5 ${category === value ? 'bg-neon text-bg' : 'text-muted hover:text-ink'}`}
              >
                {text}
              </button>
            ))}
          </div>
        </div>

        {category !== 'SPORT' && select('game', 'Videojuego', games.map((g) => [g.slug, g.name]))}
        {category !== 'ESPORT' && select('sport', 'Deporte', sports.map((s) => [s.slug, s.name]))}
        {select('country', 'País', Object.entries(COUNTRIES))}
        <label className="block">
          <span className="label">Ciudad</span>
          <input className="input" defaultValue={v('city')} onBlur={(e) => e.target.value !== v('city') && update({ city: e.target.value || null })} placeholder="Ej. Lima" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="label">Desde</span>
            <input type="date" className="input" value={v('from')} onChange={(e) => update({ from: e.target.value || null })} />
          </label>
          <label className="block">
            <span className="label">Hasta</span>
            <input type="date" className="input" value={v('to')} onChange={(e) => update({ to: e.target.value || null })} />
          </label>
        </div>
        {select('mode', 'Modalidad', [
          ['INDIVIDUAL', 'Individual'],
          ['TEAM', 'Por equipos'],
        ])}
        {select('format', 'Formato', Object.entries(FORMAT_LABEL))}
        {select('online', 'Lugar', [
          ['true', 'Online'],
          ['false', 'Presencial'],
        ])}
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="label">Cuota mín.</span>
            <input type="number" min={0} className="input" defaultValue={v('feeMin')} onBlur={(e) => update({ feeMin: e.target.value || null })} />
          </label>
          <label className="block">
            <span className="label">Cuota máx.</span>
            <input type="number" min={0} className="input" defaultValue={v('feeMax')} onBlur={(e) => update({ feeMax: e.target.value || null })} />
          </label>
        </div>
        {select('status', 'Estado', [
          ['OPEN', 'Abiertas'],
          ['IN_PROGRESS', 'En curso'],
          ['FINISHED', 'Finalizadas'],
          ['CANCELLED', 'Canceladas'],
        ])}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-[var(--color-neon)]" checked={v('verifiedOnly') === 'true'} onChange={(e) => update({ verifiedOnly: e.target.checked ? 'true' : null })} />
          Solo organizadores verificados
        </label>
        {select('sort', 'Ordenar', [
          ['upcoming', 'Próximas primero'],
          ['recent', 'Recién publicadas'],
          ['popular', 'Más inscritos'],
          ['fee_asc', 'Cuota: menor a mayor'],
          ['fee_desc', 'Cuota: mayor a menor'],
        ])}
      </div>
    </aside>
  );
}
