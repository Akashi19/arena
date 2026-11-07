import type { Metadata } from 'next';
import Link from 'next/link';
import { api, apiOrNull } from '@/lib/api';
import { requireMe } from '@/lib/session';
import type { Discipline, Team } from '@/lib/types';
import { flag } from '@/lib/format';
import { Avatar, EmptyState } from '@/components/ui';
import { ImageUpload } from '@/components/forms';
import { CreateTeamForm, MemberActions, AddMemberForm, DeleteTeamButton } from './team-forms';

export const metadata: Metadata = { title: 'Equipos' };

interface TeamFull {
  id: string;
  ownerId: string;
  captain: { id: string } | null;
  currentMembers: { id: string; role: string | null; jerseyNumber: number | null; player: { id: string; nickname: string; avatarUrl: string | null; country: string | null } }[];
}

export default async function TeamsPage() {
  const me = await requireMe('/dashboard/equipos');
  const [teams, sports, games] = await Promise.all([
    api<Team[]>('/me/teams'),
    api<Discipline[]>('/sports', { auth: false }),
    api<Discipline[]>('/games', { auth: false }),
  ]);
  const details = await Promise.all(teams.map((t) => apiOrNull<TeamFull>(`/teams/${t.slug}`)));

  return (
    <div className="space-y-6">
      <h1 className="section-title">Equipos</h1>
      <CreateTeamForm sports={sports} games={games} />

      {teams.length ? (
        <div className="space-y-4">
          {teams.map((team, i) => {
            const detail = details[i];
            const owner = team.ownerId === me.id;
            return (
              <section key={team.id} className="card p-5">
                <div className="flex flex-wrap items-start gap-4">
                  {owner ? (
                    <ImageUpload target="team" id={team.id} current={team.logoUrl} label="Escudo" />
                  ) : (
                    <Avatar src={team.logoUrl} name={team.name} size={72} />
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="text-2xl font-bold">
                      <Link href={`/equipos/${team.slug}`} className="hover:text-neon">
                        {team.name}
                      </Link>{' '}
                      {team.tag && <span className="text-base text-neon">[{team.tag}]</span>}
                    </h2>
                    <p className="text-sm text-muted">
                      {team.game?.name ?? team.sport?.name ?? 'Multidisciplina'} {flag(team.country)} · {team._count.members} integrantes · {team._count.registrations} inscripciones
                    </p>
                    {!owner && <p className="mt-1 text-xs text-muted">Eres integrante de este equipo.</p>}
                  </div>
                  {owner && <DeleteTeamButton teamId={team.id} />}
                </div>
                {detail && (
                  <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                    {detail.currentMembers.map((m) => (
                      <li key={m.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-2.5">
                        <Avatar src={m.player.avatarUrl} name={m.player.nickname} size={34} rounded="full" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {m.player.nickname} {detail.captain?.id === m.player.id && <span className="text-xs text-amber">· Capitán</span>}
                          </p>
                          <p className="text-xs text-muted">{[m.role, m.jerseyNumber != null ? `#${m.jerseyNumber}` : null].filter(Boolean).join(' · ') || 'Jugador'}</p>
                        </div>
                        {owner && <MemberActions teamId={team.id} playerId={m.player.id} isCaptain={detail.captain?.id === m.player.id} />}
                      </li>
                    ))}
                  </ul>
                )}
                {owner && <AddMemberForm teamId={team.id} />}
              </section>
            );
          })}
        </div>
      ) : (
        <EmptyState title="Aún no tienes equipos">Crea un equipo para inscribirlo en partidas por equipos.</EmptyState>
      )}
    </div>
  );
}
