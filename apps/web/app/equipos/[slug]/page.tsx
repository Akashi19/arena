import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Crown } from 'lucide-react';
import { apiOrNull } from '@/lib/api';
import type { CompetitiveProfile, TournamentStatus, VerificationStatus } from '@/lib/types';
import { CompetitiveRanking } from '@/components/competitive-ranking';
import { COUNTRIES, flag, formatDate } from '@/lib/format';
import { Avatar, Stat, StatusBadge } from '@/components/ui';

interface Member {
  id: string;
  role: string | null;
  jerseyNumber: number | null;
  joinedAt: string;
  leftAt: string | null;
  player: { id: string; nickname: string; avatarUrl: string | null; country: string | null; user: { username: string } | null };
}
interface TeamPage {
  id: string;
  name: string;
  tag: string | null;
  logoUrl: string | null;
  description: string | null;
  country: string | null;
  isActive: boolean;
  createdAt: string;
  sport: { name: string } | null;
  game: { name: string } | null;
  captain: { id: string; nickname: string } | null;
  currentMembers: Member[];
  formerMembers: Member[];
  registrations: {
    finalPosition: number | null;
    tournament: {
      name: string;
      slug: string;
      status: TournamentStatus;
      startsAt: string;
      organizer: { displayName: string; logoUrl: string | null; verificationStatus: VerificationStatus; user: { username: string } };
    };
  }[];
  stats: { tournaments: number; matchesPlayed: number; wins: number };
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = await apiOrNull<TeamPage>(`/teams/${encodeURIComponent(slug)}`, { auth: false });
  return { title: t?.name ?? 'Equipo no encontrado' };
}

export default async function TeamPublicPage({ params }: Props) {
  const { slug } = await params;
  const team = await apiOrNull<TeamPage>(`/teams/${encodeURIComponent(slug)}`, { auth: false });
  if (!team) notFound();
  const ranking = await apiOrNull<CompetitiveProfile>(`/rankings/teams/${team.id}`, { auth: false });

  return (
    <div className="space-y-8">
      <section className="card flex flex-col items-start gap-5 p-6 md:flex-row md:items-center md:p-8">
        <Avatar src={team.logoUrl} name={team.name} size={110} />
        <div>
          {team.tag && <span className="chip mb-2 border-neon/40 text-neon">[{team.tag}]</span>}
          <h1 className="text-4xl font-bold">{team.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {team.game?.name ?? team.sport?.name ?? 'Multidisciplina'} · {team.country ? `${flag(team.country)} ${COUNTRIES[team.country] ?? team.country}` : 'Internacional'} · desde {formatDate(team.createdAt)}
          </p>
          {!team.isActive && <p className="mt-1 text-sm text-amber">Equipo inactivo (se conserva su historial)</p>}
          {team.description && <p className="mt-3 max-w-2xl text-muted">{team.description}</p>}
        </div>
      </section>

      <section className="grid grid-cols-3 gap-3">
        <Stat label="Torneos" value={team.stats.tournaments} />
        <Stat label="Partidos" value={team.stats.matchesPlayed} accent="neon-2" />
        <Stat label="Victorias" value={team.stats.wins} accent="lime" />
      </section>

      <section>
        <h2 className="section-title mb-4">Integrantes</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {team.currentMembers.map((m) => (
            <div key={m.id} className="card flex items-center gap-3 p-3">
              <Avatar src={m.player.avatarUrl} name={m.player.nickname} size={44} rounded="full" />
              <div className="min-w-0">
                <p className="flex items-center gap-1 truncate font-semibold">
                  {m.player.user ? (
                    <Link href={`/jugadores/${m.player.user.username}`} className="hover:text-neon">
                      {m.player.nickname}
                    </Link>
                  ) : (
                    <>
                      {m.player.nickname} <span className="text-xs font-normal text-muted">(sin cuenta)</span>
                    </>
                  )}{" "}
                  {team.captain?.id === m.player.id && <Crown className="size-4 text-amber" aria-label="Capitán" />}
                </p>
                <p className="text-xs text-muted">
                  {[m.role, m.jerseyNumber != null ? `#${m.jerseyNumber}` : null, flag(m.player.country)].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
          ))}
        </div>
        {team.formerMembers.length > 0 && (
          <details className="mt-4 text-sm text-muted">
            <summary className="cursor-pointer">Integrantes históricos ({team.formerMembers.length})</summary>
            <ul className="mt-2 space-y-1">
              {team.formerMembers.map((m) => (
                <li key={m.id}>
                  {m.player.nickname} · {formatDate(m.joinedAt)} – {formatDate(m.leftAt!)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {ranking && <CompetitiveRanking type="TEAM" participantId={team.id} profile={ranking} title="Ranking del equipo" />}

      <section>
        <h2 className="section-title mb-4">Historial de participaciones</h2>
        {team.registrations.length ? (
          <ul className="space-y-2">
            {team.registrations.map((r) => (
              <li key={r.tournament.slug}>
                <Link href={`/torneos/${r.tournament.slug}`} className="card flex items-center gap-3 p-3 hover:border-neon/50">
                  <Avatar src={r.tournament.organizer.logoUrl} name={r.tournament.organizer.displayName} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{r.tournament.name}</p>
                    <p className="text-xs text-muted">
                      {r.tournament.organizer.displayName} · {formatDate(r.tournament.startsAt)}
                    </p>
                  </div>
                  {r.finalPosition && <span className="font-display text-lg font-bold text-amber">#{r.finalPosition}</span>}
                  <StatusBadge status={r.tournament.status} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Este equipo aún no participó en torneos.</p>
        )}
      </section>
    </div>
  );
}
