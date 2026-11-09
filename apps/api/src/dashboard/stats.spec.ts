import { describe, expect, it } from 'vitest';
import { change, fillMonths, ratio, statsRange, toCsv } from './stats.js';

describe('estadísticas: funciones puras', () => {
  it('el periodo incluye el mes en curso y el anterior tiene la misma duración', () => {
    const now = new Date('2026-11-09T15:00:00Z');
    const r = statsRange(3, now);
    expect(r.from.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(r.previousFrom.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(r.previousTo).toEqual(r.from);
    expect(r.to).toEqual(now);
    expect(r.periodEnd.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(r.keys).toEqual(['2026-09', '2026-10', '2026-11']);
  });

  it('cruza el cambio de año', () => {
    const r = statsRange(6, new Date('2026-02-10T00:00:00Z'));
    expect(r.keys).toEqual(['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
    expect(r.previousFrom.toISOString()).toBe('2025-03-01T00:00:00.000Z');
  });

  it('rellena los meses sin datos con ceros y respeta el orden', () => {
    const out = fillMonths(['2026-09', '2026-10', '2026-11'], [{ month: '2026-11', a: 4 }, { month: '2026-09', a: 1 }], ['a'] as const);
    expect(out).toEqual([
      { month: '2026-09', a: 1 },
      { month: '2026-10', a: 0 },
      { month: '2026-11', a: 4 },
    ]);
  });

  it('ratio y variación devuelven null sin base', () => {
    expect(ratio(1, 3)).toBe(0.3333);
    expect(ratio(5, 0)).toBeNull();
    expect(change(15, 10)).toBe(0.5);
    expect(change(5, 10)).toBe(-0.5);
    expect(change(3, 0)).toBeNull();
    expect(change(null, 4)).toBeNull();
  });

  it('CSV con BOM, comillas escapadas y sin inyección de fórmulas', () => {
    const csv = toCsv(['Nombre', 'Total'], [['Copa "Lima", 2026', 3], ['=HYPERLINK("x")', null], ['-5', -5]]);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines[0]).toBe('Nombre,Total');
    expect(lines[1]).toBe('"Copa ""Lima"", 2026",3');
    expect(lines[2]).toBe(`"'=HYPERLINK(""x"")",`);
    // los números negativos no se alteran; el texto que empieza con "-" sí
    expect(lines[3]).toBe("'-5,-5");
  });
});
