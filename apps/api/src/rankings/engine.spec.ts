import { describe, expect, it } from 'vitest';
import { assignPositions, DEFAULT_SCORING, parseScoring, scoringErrors, trendOf, type RankingRowInput } from './engine.js';

const row = (id: string, points: number, extra: Partial<RankingRowInput> = {}): RankingRowInput => ({
  participantId: id,
  points,
  wins: 0,
  losses: 0,
  draws: 0,
  matchesPlayed: 5,
  tournamentsPlayed: 1,
  tournamentsWon: 0,
  countryCode: 'PE',
  eligible: true,
  ...extra,
});

describe('assignPositions', () => {
  it('ordena por puntos, victorias y títulos; empate total comparte posición', () => {
    const out = assignPositions([row('a', 100), row('b', 120), row('c', 100), row('d', 100, { wins: 3 }), row('e', 90)]);
    const pos = Object.fromEntries(out.map((r) => [r.participantId, r.positionGlobal]));
    expect(pos).toEqual({ b: 1, d: 2, a: 3, c: 3, e: 5 });
  });

  it('los provisionales no tienen posición; la nacional se calcula dentro de cada país', () => {
    const out = assignPositions([row('a', 50, { countryCode: 'CL' }), row('b', 80), row('c', 200, { eligible: false }), row('d', 60, { countryCode: null })]);
    const by = Object.fromEntries(out.map((r) => [r.participantId, r]));
    expect(by.c.positionGlobal).toBeNull();
    expect([by.b.positionGlobal, by.d.positionGlobal, by.a.positionGlobal]).toEqual([1, 2, 3]);
    expect(by.a.positionCountry).toBe(1);
    expect(by.b.positionCountry).toBe(1);
    expect(by.d.positionCountry).toBeNull();
  });
});

describe('configuración de puntuación', () => {
  it('valida rangos y claves', () => {
    expect(scoringErrors(DEFAULT_SCORING)).toEqual([]);
    expect(scoringErrors({ win: 10.5 })).toHaveLength(1);
    expect(scoringErrors({ placement: { '0': 10 } })).toHaveLength(1);
    expect(scoringErrors({ tierMultiplier: { '6': 2 } })).toHaveLength(1);
    expect(scoringErrors({ bonus: 3 })).toEqual(['Clave desconocida: bonus']);
    expect(scoringErrors([])).toHaveLength(1);
  });

  it('completa con los valores por defecto', () => {
    expect(parseScoring({ win: 30 })).toEqual({ ...DEFAULT_SCORING, win: 30 });
  });
});

describe('trendOf', () => {
  it('compara con el snapshot anterior', () => {
    expect(trendOf(5, 2)).toEqual({ status: 'UP', delta: 3 });
    expect(trendOf(2, 4)).toEqual({ status: 'DOWN', delta: -2 });
    expect(trendOf(3, 3)).toEqual({ status: 'SAME', delta: 0 });
    expect(trendOf(null, 3)).toEqual({ status: 'NEW', delta: 0 });
  });
});
