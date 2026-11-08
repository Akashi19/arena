import { describe, expect, it } from 'vitest';
import {
  computeStandings,
  distributeGroups,
  doubleElimination,
  eliminationPlacements,
  league,
  playoffSeeding,
  roundRobinRounds,
  seedPositions,
  singleElimination,
  type FinishedElimMatch,
  type PlannedMatch,
} from './engine.js';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

/** Juega la llave completa: gana siempre la mejor siembra (o el azar), avanzando según los punteros. */
function simulate(plan: PlannedMatch[], pickWinner: (a: string, b: string) => string) {
  const byKey = new Map(plan.map((m) => [m.key, { ...m, slots: [...m.slots] as (string | null)[], done: false }]));
  const losses = new Map<string, number>();
  const finished: FinishedElimMatch[] = [];
  let progress = true;
  while (progress) {
    progress = false;
    for (const m of byKey.values()) {
      if (m.done || !m.slots[0] || !m.slots[1]) continue;
      const [a, b] = m.slots as [string, string];
      const w = pickWinner(a, b);
      const l = w === a ? b : a;
      m.done = true;
      progress = true;
      losses.set(l, (losses.get(l) ?? 0) + 1);
      if (m.next) byKey.get(m.next.key)!.slots[m.next.slot - 1] = w;
      if (m.loserNext) byKey.get(m.loserNext.key)!.slots[m.loserNext.slot - 1] = l;
      finished.push({ bracket: m.bracket, round: m.round, winner: w, loser: l, loserContinues: !!m.loserNext, isFinal: !m.next });
    }
  }
  return { matches: [...byKey.values()], losses, finished };
}

const bestSeed = (a: string, b: string) => (Number(a.slice(1)) < Number(b.slice(1)) ? a : b);
const underdog = (a: string, b: string) => (Number(a.slice(1)) > Number(b.slice(1)) ? a : b);

describe('seedPositions', () => {
  it('cruza 1 con N y separa a los mejores', () => {
    expect(seedPositions(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
});

describe('eliminación simple', () => {
  it('8 participantes: 7 encuentros y la final es 1 vs 2', () => {
    const plan = singleElimination(ids(8));
    expect(plan).toHaveLength(7);
    const { finished } = simulate(plan, bestSeed);
    const final = finished.find((m) => m.isFinal)!;
    expect([final.winner, final.loser]).toEqual(['p1', 'p2']);
  });

  it('con byes los mejores sembrados pasan directo a la ronda 2', () => {
    const plan = singleElimination(ids(6));
    expect(plan).toHaveLength(5); // n - 1 encuentros reales
    const round2 = plan.filter((m) => m.round === 2);
    expect(round2.flatMap((m) => m.slots)).toEqual(expect.arrayContaining(['p1', 'p2']));
    expect(plan.flatMap((m) => m.slots)).not.toContain('__BYE__');
  });

  it.each([2, 3, 5, 7, 9, 13, 16, 17])('%i participantes: todos juegan y hay un único campeón', (n) => {
    const plan = singleElimination(ids(n));
    expect(plan).toHaveLength(n - 1);
    const { matches, finished } = simulate(plan, underdog);
    expect(matches.every((m) => m.done)).toBe(true);
    expect(finished.filter((m) => m.isFinal)).toHaveLength(1);
  });
});

describe('doble eliminación', () => {
  it.each([2, 3, 4, 5, 6, 8, 11, 16])('%i participantes: la llave se completa y cada eliminado pierde dos veces', (n) => {
    const plan = doubleElimination(ids(n));
    for (const pick of [bestSeed, underdog]) {
      const { matches, losses, finished } = simulate(plan, pick);
      expect(matches.every((m) => m.done)).toBe(true);
      const final = finished.find((m) => m.isFinal)!;
      expect(final.bracket).toBe('GRAND_FINAL');
      for (const id of ids(n)) {
        if (id === final.winner) expect(losses.get(id) ?? 0).toBeLessThanOrEqual(1);
        else if (id !== final.loser) expect(losses.get(id)).toBe(2);
      }
    }
  });

  it('4 participantes: 3 de ganadores, 2 de perdedores y la gran final', () => {
    const plan = doubleElimination(ids(4));
    expect(plan.filter((m) => m.bracket === 'WINNERS')).toHaveLength(3);
    expect(plan.filter((m) => m.bracket === 'LOSERS')).toHaveLength(2);
    expect(plan.filter((m) => m.bracket === 'GRAND_FINAL')).toHaveLength(1);
  });
});

describe('liga y grupos', () => {
  it('todos contra todos una vez, sin repetir rival en la ronda', () => {
    for (const n of [2, 3, 4, 5, 6, 7, 10]) {
      const rounds = roundRobinRounds(ids(n));
      const pairs = rounds.flat().map(([a, b]) => [a, b].sort().join('-'));
      expect(new Set(pairs).size).toBe((n * (n - 1)) / 2);
      for (const r of rounds) {
        const seen = r.flat();
        expect(new Set(seen).size).toBe(seen.length);
      }
    }
    expect(league(ids(4))).toHaveLength(6);
  });

  it('reparto en serpiente equilibra los grupos', () => {
    const groups = distributeGroups(ids(8), 2);
    expect(groups.get('A')).toEqual(['p1', 'p4', 'p5', 'p8']);
    expect(groups.get('B')).toEqual(['p2', 'p3', 'p6', 'p7']);
  });
});

describe('clasificación', () => {
  const pts = { win: 3, draw: 1, loss: 0 };

  it('suma puntos y desempata por diferencia', () => {
    const rows = computeStandings(
      ['a', 'b', 'c'],
      [
        { home: 'a', away: 'b', homeScore: 1, awayScore: 0 },
        { home: 'b', away: 'c', homeScore: 3, awayScore: 0 },
        { home: 'c', away: 'a', homeScore: 1, awayScore: 0 },
      ],
      pts,
    );
    expect(rows.map((r) => [r.registrationId, r.points, r.position])).toEqual([
      ['b', 3, 1],
      ['a', 3, 2],
      ['c', 3, 3],
    ]);
  });

  it('empate en marcador con ganador por desempate cuenta como victoria', () => {
    const rows = computeStandings(['a', 'b'], [{ home: 'a', away: 'b', homeScore: 1, awayScore: 1, winner: 'b' }], pts);
    expect(rows[0]).toMatchObject({ registrationId: 'b', wins: 1, points: 3 });
  });

  it('empate puro reparte puntos de empate', () => {
    const rows = computeStandings(['a', 'b'], [{ home: 'a', away: 'b', homeScore: 2, awayScore: 2 }], pts);
    expect(rows.map((r) => r.points)).toEqual([1, 1]);
    expect(rows[0].registrationId).toBe('a'); // desempate final por siembra
  });

  it('siembra de playoffs: primeros de grupo antes que los segundos', () => {
    const a = computeStandings(['a1', 'a2'], [{ home: 'a1', away: 'a2', homeScore: 2, awayScore: 0 }], pts);
    const b = computeStandings(['b1', 'b2'], [{ home: 'b1', away: 'b2', homeScore: 1, awayScore: 0 }], pts);
    const seeded = playoffSeeding(new Map([['A', a], ['B', b]]), 2);
    expect(seeded).toEqual(['a1', 'b1', 'a2', 'b2']);
    // En la llave se cruzan 1A-2B y 1B-2A
    const plan = singleElimination(seeded, 'PLAYOFF');
    const semis = plan.filter((m) => m.round === 1).map((m) => m.slots.join('-'));
    expect(semis).toEqual(['a1-b2', 'b1-a2']);
  });
});

describe('posiciones finales', () => {
  it('eliminación simple: semifinalistas comparten el 3.º puesto', () => {
    const plan = singleElimination(ids(4));
    const { finished } = simulate(plan, bestSeed);
    const places = eliminationPlacements(finished, ids(4));
    expect(Object.fromEntries(places)).toEqual({ p1: 1, p2: 2, p3: 3, p4: 3 });
  });

  it('doble eliminación: el perdedor de la final de perdedores es 3.º', () => {
    const { finished } = simulate(doubleElimination(ids(4)), bestSeed);
    const places = eliminationPlacements(finished, ids(4));
    expect(places.get('p1')).toBe(1);
    expect(places.get('p2')).toBe(2);
    expect(places.get('p3')).toBe(3);
    expect(places.get('p4')).toBe(4);
  });
});
