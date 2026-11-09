import Link from 'next/link';
import { CalendarClock, MapPin, Radio } from 'lucide-react';
import type { Fixture, FixtureMatch, StandingEntry } from '@/lib/types';
import { buildSections, entrantImage, entrantName, formatScore, type FixtureSection } from '@/lib/fixture';
import { formatDateTime } from '@/lib/format';
import { Avatar } from '@/components/ui';
import { PrivateNote, StreamBadge, WatchLink } from '@/components/stream';

/** Vista pública del fixture: llaves, fechas de liga/grupos y tablas de posiciones. */
export function FixtureView({ fixture }: { fixture: Fixture }) {
  const sections = buildSections(fixture);
  const team = fixture.tournament.mode === 'TEAM';
  const qualifiers = fixture.tournament.format === 'GROUPS_PLAYOFFS' ? (fixture.tournament.qualifiersPerGroup ?? 0) : 0;
  const { total, completed } = fixture.progress;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-neon" style={{ width: `${total ? (completed / total) * 100 : 0}%` }} />
        </div>
        <span className="text-xs text-muted">
          {completed}/{total} encuentros jugados
        </span>
      </div>
      {sections.map((s) => (
        <SectionView key={s.key} section={s} team={team} qualifiers={qualifiers} championId={fixture.tournament.championRegistrationId} />
      ))}
    </div>
  );
}

export function SectionView({
  section,
  team,
  qualifiers = 0,
  championId,
}: {
  section: FixtureSection;
  team: boolean;
  qualifiers?: number;
  championId?: string | null;
}) {
  return (
    <section className="space-y-3">
      <h3 className="font-display text-lg font-bold uppercase tracking-wide text-neon-2">{section.title}</h3>
      {section.standings && section.standings.length > 0 && <StandingsTable rows={section.standings} team={team} qualifiers={qualifiers} />}
      {section.layout === 'bracket' ? (
        <BracketView rounds={section.rounds} team={team} championId={championId} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {section.rounds.map((r) => (
            <div key={r.title} className="rounded-xl border border-line bg-surface-2 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{r.title}</p>
              <ul className="space-y-1.5">
                {r.matches.map((m) => (
                  <ListMatch key={m.id} match={m} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function BracketView({ rounds, team, championId }: { rounds: FixtureSection['rounds']; team: boolean; championId?: string | null }) {
  return (
    // El desplazamiento horizontal queda dentro de la llave: la página nunca se ensancha
    <div className="-mx-1 overflow-x-auto px-1 pb-2">
      <div className="flex min-w-max gap-4">
        {rounds.map((r) => (
          <div key={r.title} className="flex w-56 flex-col">
            <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wider text-muted">{r.title}</p>
            <div className="flex flex-1 flex-col justify-around gap-3">
              {r.matches.map((m) => (
                <BracketMatch key={m.id} match={m} team={team} championId={championId} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketMatch({ match, team, championId }: { match: FixtureMatch; team: boolean; championId?: string | null }) {
  const live = match.status === 'LIVE';
  return (
    <div className={`overflow-hidden rounded-xl border bg-surface-2 ${live ? 'border-danger/60 shadow-[0_0_16px] shadow-danger/20' : 'border-line'}`}>
      {[1, 2].map((slot) => {
        const p = match.participants.find((x) => x.slot === slot);
        const winner = p?.isWinner === true;
        const loser = p?.isWinner === false;
        return (
          <div
            key={slot}
            className={`flex items-center gap-2 px-2.5 py-1.5 text-sm ${slot === 1 ? 'border-b border-line' : ''} ${winner ? 'bg-neon/10' : ''}`}
          >
            {p ? (
              <>
                <Avatar src={entrantImage(p.registration)} name={entrantName(p.registration)} size={22} rounded={team ? 'xl' : 'full'} />
                <span className={`min-w-0 flex-1 truncate ${winner ? 'font-semibold text-ink' : loser ? 'text-muted' : ''}`}>
                  {entrantName(p.registration)}
                  {championId === p.registration.id && ' 👑'}
                </span>
                <span className={`font-display font-bold tabular-nums ${winner ? 'text-neon' : 'text-muted'}`}>{formatScore(p.score)}</span>
              </>
            ) : (
              <span className="italic text-muted/70">Por definir</span>
            )}
          </div>
        );
      })}
      <MatchMeta match={match} />
      <StreamRow match={match} />
    </div>
  );
}

function ListMatch({ match }: { match: FixtureMatch }) {
  const [home, away] = [1, 2].map((s) => match.participants.find((p) => p.slot === s));
  const done = match.status === 'COMPLETED';
  return (
    <li className="rounded-lg bg-surface p-2">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
        <span className={`truncate text-right ${home?.isWinner ? 'font-semibold' : done && home?.isWinner === false ? 'text-muted' : ''}`}>
          {entrantName(home?.registration)}
        </span>
        <Link
          href={`/encuentros/${match.id}`}
          className="rounded-md bg-surface-3 px-2 py-0.5 font-display font-bold tabular-nums hover:text-neon"
          aria-label={`Detalle del encuentro ${entrantName(home?.registration)} contra ${entrantName(away?.registration)}`}
        >
          {done ? `${formatScore(home?.score ?? null)} - ${formatScore(away?.score ?? null)}` : 'vs'}
        </Link>
        <span className={`truncate ${away?.isWinner ? 'font-semibold' : done && away?.isWinner === false ? 'text-muted' : ''}`}>
          {entrantName(away?.registration)}
        </span>
      </div>
      <MatchMeta match={match} compact />
      <StreamRow match={match} compact />
    </li>
  );
}

/** Transmisión del encuentro: EN VIVO / PRÓXIMAMENTE / FINALIZADA + acceso directo. */
function StreamRow({ match, compact = false }: { match: FixtureMatch; compact?: boolean }) {
  const s = match.stream;
  if (!s || s.status === 'CANCELLED' || s.status === 'NOT_CONFIGURED') {
    return compact ? null : (
      <Link href={`/encuentros/${match.id}`} className="block border-t border-line py-1 text-center text-[11px] text-muted hover:text-neon">
        Ver encuentro
      </Link>
    );
  }
  return (
    <div className={`flex flex-wrap items-center justify-center gap-2 ${compact ? 'mt-1.5' : 'border-t border-line px-2 py-1.5'}`}>
      <Link href={`/encuentros/${match.id}`} aria-label={`Transmisión del encuentro: ${s.platformName}`} className="flex items-center gap-1.5">
        <StreamBadge status={s.status} />
        <span className="text-[11px] text-muted">{s.platformName}</span>
      </Link>
      {s.url ? <WatchLink url={s.url} platformName={s.platformName} compact className="py-0.5" /> : s.visibility === 'PRIVATE' && <PrivateNote compact />}
    </div>
  );
}

function MatchMeta({ match, compact = false }: { match: FixtureMatch; compact?: boolean }) {
  if (match.status === 'LIVE') {
    return (
      <p className={`flex items-center justify-center gap-1 text-[11px] font-semibold uppercase text-danger ${compact ? 'mt-1' : 'border-t border-line py-1'}`}>
        <Radio className="size-3 animate-pulse" /> En vivo
      </p>
    );
  }
  if (match.status === 'COMPLETED' && match.result && match.result.version > 1) {
    return (
      <p className={`text-center text-[11px] text-amber ${compact ? 'mt-1' : 'border-t border-line py-1'}`} title={match.result.correctionReason ?? undefined}>
        Resultado corregido
      </p>
    );
  }
  if (match.status === 'COMPLETED' || (!match.scheduledAt && !match.venue)) return null;
  return (
    <p className={`flex items-center justify-center gap-2 text-[11px] text-muted ${compact ? 'mt-1' : 'border-t border-line py-1'}`}>
      {match.scheduledAt && (
        <span className="flex items-center gap-1">
          <CalendarClock className="size-3" /> {formatDateTime(match.scheduledAt)}
        </span>
      )}
      {match.venue && (
        <span className="flex items-center gap-1 truncate">
          <MapPin className="size-3" /> {match.venue}
        </span>
      )}
    </p>
  );
}

export function StandingsTable({ rows, team, qualifiers = 0 }: { rows: StandingEntry[]; team: boolean; qualifiers?: number }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="bg-surface-3 text-[11px] uppercase tracking-wider text-muted">
          <tr>
            <th className="w-10 px-2 py-2 text-center">#</th>
            <th className="px-2 py-2 text-left">{team ? 'Equipo' : 'Jugador'}</th>
            <th className="px-2 py-2 text-center" title="Partidos jugados">PJ</th>
            <th className="px-2 py-2 text-center" title="Ganados">G</th>
            <th className="px-2 py-2 text-center" title="Empatados">E</th>
            <th className="px-2 py-2 text-center" title="Perdidos">P</th>
            <th className="px-2 py-2 text-center" title="Diferencia">+/-</th>
            <th className="px-2 py-2 text-center">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const diff = Number(r.scoreFor) - Number(r.scoreAgainst);
            const qualifies = qualifiers > 0 && (r.position ?? 99) <= qualifiers;
            const name = entrantName(r.registration);
            return (
              <tr key={r.registration.id} className="border-t border-line">
                <td className={`px-2 py-2 text-center font-display font-bold ${qualifies ? 'border-l-2 border-neon text-neon' : 'text-muted'}`}>
                  {r.position}
                </td>
                <td className="px-2 py-2">
                  <span className="flex items-center gap-2">
                    <Avatar src={entrantImage(r.registration)} name={name} size={22} rounded={team ? 'xl' : 'full'} />
                    {r.registration.team ? (
                      <Link href={`/equipos/${r.registration.team.slug}`} className="truncate font-semibold hover:text-neon">
                        {name}
                      </Link>
                    ) : (
                      <span className="truncate font-semibold">{name}</span>
                    )}
                  </span>
                </td>
                <td className="px-2 py-2 text-center tabular-nums">{r.played}</td>
                <td className="px-2 py-2 text-center tabular-nums">{r.wins}</td>
                <td className="px-2 py-2 text-center tabular-nums">{r.draws}</td>
                <td className="px-2 py-2 text-center tabular-nums">{r.losses}</td>
                <td className="px-2 py-2 text-center tabular-nums">{diff > 0 ? `+${diff}` : diff}</td>
                <td className="px-2 py-2 text-center font-display font-bold tabular-nums text-ink">{r.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
