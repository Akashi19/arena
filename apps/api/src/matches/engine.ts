/**
 * Motor de fixtures y llaves: funciones puras (sin base de datos) para poder probarlas en aislamiento.
 *
 * - Eliminación simple y doble: se construye la llave completa para la potencia de 2 siguiente y luego se
 *   "colapsan" los encuentros con bye: el participante (o el encuentro que lo alimenta) pasa directo al
 *   siguiente encuentro. Así nunca queda un encuentro esperando a un rival inexistente.
 * - Liga (todos contra todos): método circular; con número impar, cada ronda descansa un participante.
 * - Grupos: reparto en serpiente según la siembra y liga dentro de cada grupo.
 */

export type ElimBracket = 'WINNERS' | 'LOSERS' | 'GRAND_FINAL' | 'PLAYOFF';
export type PlannedBracket = ElimBracket | 'GROUP' | 'LEAGUE';

export const ELIMINATION_BRACKETS: readonly string[] = ['WINNERS', 'LOSERS', 'GRAND_FINAL', 'PLAYOFF'];

const BYE = '__BYE__';

export interface PlannedMatch {
  key: string;
  bracket: PlannedBracket;
  round: number;
  position: number;
  groupLabel: string | null;
  /** IDs de inscripción por slot (1 y 2). `null` = pendiente del encuentro anterior. */
  slots: [string | null, string | null];
  next: { key: string; slot: 1 | 2 } | null;
  loserNext: { key: string; slot: 1 | 2 } | null;
}

/** Orden estándar de siembra: 1 vs N, 2 vs N-1… repartidos para que los mejores se crucen lo más tarde posible. */
export function seedPositions(size: number): number[] {
  let pos = [1];
  while (pos.length < size) {
    const sum = pos.length * 2 + 1;
    pos = pos.flatMap((s) => [s, sum - s]);
  }
  return pos;
}

export function nextPowerOfTwo(n: number) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

const mkey = (bracket: string, round: number, position: number) => `${bracket}:${round}:${position}`;

function firstRoundSlots(seeded: string[], size: number): [string, string][] {
  const order = seedPositions(size).map((s) => seeded[s - 1] ?? BYE);
  const pairs: [string, string][] = [];
  for (let i = 0; i < order.length; i += 2) pairs.push([order[i], order[i + 1]]);
  return pairs;
}

/** Llave de eliminación simple. `seeded` va de mejor a peor siembra. */
export function singleElimination(seeded: string[], bracket: 'WINNERS' | 'PLAYOFF' = 'WINNERS'): PlannedMatch[] {
  if (seeded.length < 2) throw new Error('Se necesitan al menos 2 participantes');
  const size = nextPowerOfTwo(seeded.length);
  const rounds = Math.log2(size);
  const matches: PlannedMatch[] = [];
  const pairs = firstRoundSlots(seeded, size);
  for (let r = 1; r <= rounds; r++) {
    const count = size / 2 ** r;
    for (let p = 1; p <= count; p++) {
      matches.push({
        key: mkey(bracket, r, p),
        bracket,
        round: r,
        position: p,
        groupLabel: null,
        slots: r === 1 ? pairs[p - 1] : [null, null],
        next: r < rounds ? { key: mkey(bracket, r + 1, Math.ceil(p / 2)), slot: p % 2 === 1 ? 1 : 2 } : null,
        loserNext: null,
      });
    }
  }
  return collapseByes(matches);
}

/**
 * Doble eliminación: llave de ganadores, llave de perdedores y gran final (a un encuentro).
 * Los perdedores de la ronda r+1 de ganadores entran en orden inverso para evitar revanchas inmediatas.
 */
export function doubleElimination(seeded: string[]): PlannedMatch[] {
  if (seeded.length < 2) throw new Error('Se necesitan al menos 2 participantes');
  const size = Math.max(4, nextPowerOfTwo(seeded.length));
  const k = Math.log2(size);
  const matches: PlannedMatch[] = [];
  const pairs = firstRoundSlots(seeded, size);
  const gf = mkey('GRAND_FINAL', 1, 1);

  // Llave de ganadores
  for (let r = 1; r <= k; r++) {
    const count = size / 2 ** r;
    for (let p = 1; p <= count; p++) {
      let loserNext: PlannedMatch['loserNext'];
      if (r === 1) loserNext = { key: mkey('LOSERS', 1, Math.ceil(p / 2)), slot: p % 2 === 1 ? 1 : 2 };
      else loserNext = { key: mkey('LOSERS', 2 * (r - 1), count - p + 1), slot: 2 };
      matches.push({
        key: mkey('WINNERS', r, p),
        bracket: 'WINNERS',
        round: r,
        position: p,
        groupLabel: null,
        slots: r === 1 ? pairs[p - 1] : [null, null],
        next: r < k ? { key: mkey('WINNERS', r + 1, Math.ceil(p / 2)), slot: p % 2 === 1 ? 1 : 2 } : { key: gf, slot: 1 },
        loserNext,
      });
    }
  }

  // Llave de perdedores: 2(k-1) rondas
  const lbRounds = 2 * (k - 1);
  for (let lr = 1; lr <= lbRounds; lr++) {
    // Rondas 2j-1 y 2j tienen size / 2^(j+1) encuentros
    const count = size / 2 ** (Math.ceil(lr / 2) + 1);
    for (let p = 1; p <= count; p++) {
      let next: PlannedMatch['next'];
      if (lr === lbRounds) next = { key: gf, slot: 2 };
      else if (lr % 2 === 1) next = { key: mkey('LOSERS', lr + 1, p), slot: 1 };
      else next = { key: mkey('LOSERS', lr + 1, Math.ceil(p / 2)), slot: p % 2 === 1 ? 1 : 2 };
      matches.push({
        key: mkey('LOSERS', lr, p),
        bracket: 'LOSERS',
        round: lr,
        position: p,
        groupLabel: null,
        slots: [null, null],
        next,
        loserNext: null,
      });
    }
  }

  matches.push({
    key: gf,
    bracket: 'GRAND_FINAL',
    round: 1,
    position: 1,
    groupLabel: null,
    slots: [null, null],
    next: null,
    loserNext: null,
  });
  return collapseByes(matches);
}

/**
 * Elimina los encuentros con bye. Un slot está "muerto" si contiene BYE. Un encuentro con dos slots muertos
 * desaparece y deja muertos sus destinos; con un slot muerto, el otro lado (participante o encuentro que lo
 * alimenta) se conecta directo al siguiente encuentro y el destino del perdedor queda muerto.
 */
export function collapseByes(input: PlannedMatch[]): PlannedMatch[] {
  const byKey = new Map(input.map((m) => [m.key, { ...m, slots: [...m.slots] as [string | null, string | null] }]));
  const setSlot = (target: { key: string; slot: 1 | 2 } | null, value: string | null) => {
    if (!target) return;
    const t = byKey.get(target.key);
    if (t) t.slots[target.slot - 1] = value;
  };
  const feederOf = (key: string, slot: 1 | 2) => {
    for (const m of byKey.values()) {
      if (m.next?.key === key && m.next.slot === slot) return { match: m, kind: 'next' as const };
      if (m.loserNext?.key === key && m.loserNext.slot === slot) return { match: m, kind: 'loserNext' as const };
    }
    return null;
  };

  let changed = true;
  while (changed) {
    changed = false;
    for (const m of [...byKey.values()]) {
      const dead = m.slots.map((s) => s === BYE);
      if (!dead[0] && !dead[1]) continue;
      byKey.delete(m.key);
      changed = true;
      if (dead[0] && dead[1]) {
        setSlot(m.next, BYE);
        setSlot(m.loserNext, BYE);
        continue;
      }
      const liveSlot = (dead[0] ? 2 : 1) as 1 | 2;
      const live = m.slots[liveSlot - 1];
      if (live) {
        setSlot(m.next, live);
      } else {
        const feeder = feederOf(m.key, liveSlot);
        if (feeder) feeder.match[feeder.kind] = m.next;
      }
      setSlot(m.loserNext, BYE);
    }
  }
  return [...byKey.values()].map((m) => ({ ...m, slots: m.slots }));
}

/** Liga todos contra todos (método circular). Devuelve una lista de rondas con sus cruces. */
export function roundRobinRounds(ids: string[]): [string, string][][] {
  const list: (string | null)[] = ids.length % 2 ? [...ids, null] : [...ids];
  const n = list.length;
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a && b) pairs.push(r % 2 === 1 && i === 0 ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop()!);
  }
  return rounds;
}

export function league(ids: string[], bracket: 'LEAGUE' | 'GROUP' = 'LEAGUE', groupLabel: string | null = null): PlannedMatch[] {
  if (ids.length < 2) throw new Error('Se necesitan al menos 2 participantes');
  return roundRobinRounds(ids).flatMap((pairs, r) =>
    pairs.map((pair, p) => ({
      key: mkey(`${bracket}${groupLabel ?? ''}`, r + 1, p + 1),
      bracket,
      round: r + 1,
      position: p + 1,
      groupLabel,
      slots: pair,
      next: null,
      loserNext: null,
    })),
  );
}

export const groupLabelAt = (i: number) => String.fromCharCode(65 + i);

/** Reparto en serpiente: A B C C B A A B C… para equilibrar la fuerza de los grupos. */
export function distributeGroups(seeded: string[], groupCount: number): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (let g = 0; g < groupCount; g++) groups.set(groupLabelAt(g), []);
  seeded.forEach((id, i) => {
    const row = Math.floor(i / groupCount);
    const col = i % groupCount;
    const g = row % 2 === 0 ? col : groupCount - 1 - col;
    groups.get(groupLabelAt(g))!.push(id);
  });
  return groups;
}

// ---------------------------------------------------------------------------- Clasificación

export interface ScoredResult {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  /** Ganador cuando el marcador empata pero hubo desempate (penales, etc.). */
  winner?: string | null;
}

export interface StandingRow {
  registrationId: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  scoreFor: number;
  scoreAgainst: number;
  points: number;
  position: number;
}

/**
 * Tabla de posiciones. Desempates: puntos, diferencia, anotados, victorias, enfrentamiento directo
 * (entre dos empatados) y, por último, la siembra (orden de `ids`).
 */
export function computeStandings(
  ids: string[],
  results: ScoredResult[],
  pts: { win: number; draw: number; loss: number },
): StandingRow[] {
  const rows = new Map<string, StandingRow>(
    ids.map((id) => [
      id,
      { registrationId: id, played: 0, wins: 0, draws: 0, losses: 0, scoreFor: 0, scoreAgainst: 0, points: 0, position: 0 },
    ]),
  );
  const h2h = new Map<string, number>(); // "a|b" -> puntos de a contra b

  for (const r of results) {
    const a = rows.get(r.home);
    const b = rows.get(r.away);
    if (!a || !b) continue;
    a.played++;
    b.played++;
    a.scoreFor += r.homeScore;
    a.scoreAgainst += r.awayScore;
    b.scoreFor += r.awayScore;
    b.scoreAgainst += r.homeScore;
    const winner = r.homeScore > r.awayScore ? r.home : r.awayScore > r.homeScore ? r.away : (r.winner ?? null);
    const award = (row: StandingRow, other: string, outcome: 'W' | 'D' | 'L') => {
      const p = outcome === 'W' ? pts.win : outcome === 'D' ? pts.draw : pts.loss;
      if (outcome === 'W') row.wins++;
      else if (outcome === 'D') row.draws++;
      else row.losses++;
      row.points += p;
      const k = `${row.registrationId}|${other}`;
      h2h.set(k, (h2h.get(k) ?? 0) + p);
    };
    if (!winner) {
      award(a, r.away, 'D');
      award(b, r.home, 'D');
    } else {
      award(a, r.away, winner === r.home ? 'W' : 'L');
      award(b, r.home, winner === r.away ? 'W' : 'L');
    }
  }

  const seedIndex = new Map(ids.map((id, i) => [id, i]));
  const sorted = [...rows.values()].sort((x, y) => {
    const diff = (r: StandingRow) => r.scoreFor - r.scoreAgainst;
    return (
      y.points - x.points ||
      diff(y) - diff(x) ||
      y.scoreFor - x.scoreFor ||
      y.wins - x.wins ||
      (h2h.get(`${y.registrationId}|${x.registrationId}`) ?? 0) - (h2h.get(`${x.registrationId}|${y.registrationId}`) ?? 0) ||
      seedIndex.get(x.registrationId)! - seedIndex.get(y.registrationId)!
    );
  });
  sorted.forEach((r, i) => (r.position = i + 1));
  return sorted;
}

/**
 * Siembra de playoffs a partir de los grupos: primero los 1.º (ordenados por rendimiento) y después
 * los 2.º, 3.º… en el mismo orden de grupos. Con la siembra estándar (1 vs N, 2 vs N-1…) el 1.º de un
 * grupo se cruza con el clasificado de otro grupo: 1A-2B, 1B-2A.
 */
export function playoffSeeding(groups: Map<string, StandingRow[]>, qualifiersPerGroup: number): string[] {
  const winners = [...groups.entries()]
    .map(([label, rows]) => ({ label, row: rows.find((r) => r.position === 1) }))
    .filter((x): x is { label: string; row: StandingRow } => !!x.row)
    .sort(
      (a, b) =>
        b.row.points / Math.max(1, b.row.played) - a.row.points / Math.max(1, a.row.played) ||
        b.row.scoreFor - b.row.scoreAgainst - (a.row.scoreFor - a.row.scoreAgainst) ||
        b.row.scoreFor - a.row.scoreFor ||
        a.label.localeCompare(b.label),
    );
  const order = winners.map((w) => w.label);
  const seeded: string[] = [];
  for (let place = 1; place <= qualifiersPerGroup; place++) {
    for (const label of order) {
      const row = groups.get(label)!.find((r) => r.position === place);
      if (row) seeded.push(row.registrationId);
    }
  }
  return seeded;
}

// ---------------------------------------------------------------------------- Posiciones finales

export interface FinishedElimMatch {
  bracket: string;
  round: number;
  winner: string;
  loser: string;
  /** El perdedor continúa en otra llave (doble eliminación). */
  loserContinues: boolean;
  isFinal: boolean;
}

/**
 * Posiciones finales en eliminación: el campeón es el ganador del encuentro final; el resto se ordena
 * por la etapa en la que quedó eliminado (empates comparten posición: 3.º-3.º, 5.º-5.º…).
 */
export function eliminationPlacements(matches: FinishedElimMatch[], allIds: string[]): Map<string, number> {
  const stage = new Map<string, number>(allIds.map((id) => [id, -1]));
  for (const m of matches) {
    if (m.isFinal) {
      stage.set(m.winner, 100_001);
      stage.set(m.loser, 100_000);
    } else if (!m.loserContinues) {
      stage.set(m.loser, m.bracket === 'GRAND_FINAL' ? 100_000 : m.round);
    }
  }
  const values = [...stage.values()];
  return new Map([...stage.entries()].map(([id, s]) => [id, 1 + values.filter((v) => v > s).length]));
}
