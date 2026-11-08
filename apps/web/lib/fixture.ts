import type { BracketSide, Fixture, FixtureEntrant, FixtureMatch, StandingEntry } from './types';

export const ELIMINATION: BracketSide[] = ['WINNERS', 'LOSERS', 'GRAND_FINAL', 'PLAYOFF'];
export const isElimination = (b: BracketSide) => ELIMINATION.includes(b);

export const entrantName = (e?: FixtureEntrant | null) => e?.team?.name ?? e?.player?.nickname ?? 'Por definir';
export const entrantImage = (e?: FixtureEntrant | null) => e?.team?.logoUrl ?? e?.player?.avatarUrl ?? null;

export interface FixtureSection {
  key: string;
  title: string;
  layout: 'bracket' | 'list';
  groupLabel?: string;
  standings?: StandingEntry[];
  rounds: { title: string; matches: FixtureMatch[] }[];
}

function eliminationRoundTitle(round: number, max: number) {
  const fromEnd = max - round;
  return ['Final', 'Semifinales', 'Cuartos de final', 'Octavos de final', 'Dieciseisavos'][fromEnd] ?? `Ronda ${round}`;
}

function byRound(matches: FixtureMatch[], title: (round: number, max: number) => string) {
  const max = Math.max(...matches.map((m) => m.round));
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  return rounds.map((r) => ({
    title: title(r, max),
    matches: matches.filter((m) => m.round === r).sort((a, b) => a.position - b.position),
  }));
}

/** Agrupa el fixture en secciones legibles según el formato: grupos, liga, llaves y gran final. */
export function buildSections(fx: Fixture): FixtureSection[] {
  const sections: FixtureSection[] = [];
  const of = (b: BracketSide) => fx.matches.filter((m) => m.bracket === b);
  const double = fx.tournament.format === 'DOUBLE_ELIMINATION';

  const groupLabels = [...new Set(of('GROUP').map((m) => m.groupLabel ?? ''))].sort();
  for (const label of groupLabels) {
    sections.push({
      key: `group-${label}`,
      title: `Grupo ${label}`,
      layout: 'list',
      groupLabel: label,
      standings: fx.standings.filter((s) => s.groupLabel === label),
      rounds: byRound(of('GROUP').filter((m) => m.groupLabel === label), (r) => `Fecha ${r}`),
    });
  }
  if (of('LEAGUE').length) {
    sections.push({
      key: 'league',
      title: 'Liga',
      layout: 'list',
      standings: fx.standings,
      rounds: byRound(of('LEAGUE'), (r) => `Fecha ${r}`),
    });
  }
  if (of('PLAYOFF').length) {
    sections.push({ key: 'playoff', title: 'Playoffs', layout: 'bracket', rounds: byRound(of('PLAYOFF'), eliminationRoundTitle) });
  }
  if (of('WINNERS').length) {
    sections.push({
      key: 'winners',
      title: double ? 'Llave de ganadores' : 'Llave',
      layout: 'bracket',
      rounds: byRound(of('WINNERS'), double ? (r, max) => (r === max ? 'Final de ganadores' : `Ronda ${r}`) : eliminationRoundTitle),
    });
  }
  if (of('LOSERS').length) {
    sections.push({
      key: 'losers',
      title: 'Llave de perdedores',
      layout: 'bracket',
      rounds: byRound(of('LOSERS'), (r, max) => (r === max ? 'Final de perdedores' : `Ronda ${r}`)),
    });
  }
  if (of('GRAND_FINAL').length) {
    sections.push({ key: 'grand-final', title: 'Gran final', layout: 'bracket', rounds: [{ title: 'Gran final', matches: of('GRAND_FINAL') }] });
  }
  return sections;
}

export const formatScore = (s: string | null) => (s === null ? '' : String(Number(s)));
