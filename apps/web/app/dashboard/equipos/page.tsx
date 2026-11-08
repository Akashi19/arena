import type { Metadata } from 'next';
import Link from 'next/link';
import { api, apiOrNull } from '@/lib/api';
import { requireMe } from '@/lib/session';
import type { Discipline, MyInvitation, Team, TeamInvitation } from '@/lib/types';
import { flag, formatDate, INVITATION_STATUS_LABEL } from '@/lib/format';
import { Avatar, EmptyState } from '@/components/ui';
import { ImageUpload } from '@/components/forms';
import { CreateTeamForm, MemberActions, AddMemberForm, AddGuestForm, DeleteTeamButton } from './team-forms';
import { CancelInvitationButton, InviteForm, RespondInvitation } from './invitation-forms';

export const metadata: Metadata = { title: 'Equipos' };

interface TeamFull {
  id: string;
  ownerId: string;
  captain: { id: string } | null;
  currentMembers: { id: string; role: string | null; jerseyNumber: number | null; player: { id: string; nickname: string; avatarUrl: string | null; country: string | null; user: { username: string } | null } }[];
}

export default async function TeamsPage({ searchParams }: { searchParams: Promise<{ invitar?: string }> }) {
  const sp = await searchParams;
  const me = await requireMe('/dashboard/equipos');
  const [teams, sports, games, received] = await Promise.all([
    api<Team[]>('/me/teams'),
    api<Discipline[]>('/sports', { auth: false }),
    api<Discipline[]>('/games', { auth: false }),
    api<MyInvitation[]>('/me/invitations'),
  ]);
  const details = await Promise.all(teams.map((t) => apiOrNull<TeamFull>(`/teams/${t.slug}`)));
  const sent = await Promise.all(teams.map((t) => (t.ownerId === me.id ? api<TeamInvitation[]>(`/teams/${t.id}/invitations`).catch(() => []) : [])));
  const invitee = sp.invitar?.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);

  return (
    <div className="space-y-6">
      <h1 className="section-title">Equipos</h1>

      {received.length > 0 && (
        <section className="card space-y-3 border-lime/40 p-5">
          <h2 className="text-lg font-bold uppercase">Invitaciones recibidas</h2>
          <ul className="space-y-3">
            {received.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
                <Avatar src={inv.team.logoUrl} name={inv.team.name} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    <Link href={`/equipos/${inv.team.slug}`} className="hover:text-neon">
                      {inv.team.name}
                    </Link>{' '}
                    {inv.team.tag && <span className="text-sm text-neon">[{inv.team.tag}]</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {inv.team.game?.name ?? inv.team.sport?.name ?? 'Multidisciplina'} {flag(inv.team.country)} · {inv.team._count.members} integrantes ·
                    de @{inv.sentBy.username} · {formatDate(inv.createdAt)}
                  </p>
                  {inv.message && <p className="mt-1 text-sm">“{inv.message}”</p>}
                </div>
                <RespondInvitation id={inv.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {invitee && !teams.some((t) => t.ownerId === me.id) && (
        <p className="card p-4 text-sm text-muted">Para invitar a @{invitee} primero crea un equipo.</p>
      )}

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
                            {m.player.nickname}{!m.player.user && <span className="text-xs font-normal text-muted"> (sin cuenta)</span>}{" "}
                            {detail.captain?.id === m.player.id && <span className="text-xs text-amber">· Capitán</span>}
                          </p>
                          <p className="text-xs text-muted">{[m.role, m.jerseyNumber != null ? `#${m.jerseyNumber}` : null].filter(Boolean).join(' · ') || 'Jugador'}</p>
                        </div>
                        {owner && <MemberActions teamId={team.id} playerId={m.player.id} isCaptain={detail.captain?.id === m.player.id} />}
                      </li>
                    ))}
                  </ul>
                )}
                {owner && (
                  <div className="mt-4 space-y-2 border-t border-line pt-4">
                    <h3 className="text-sm font-bold uppercase">Invitar jugadores</h3>
                    <p className="text-xs text-muted">
                      El jugador recibe la invitación y decide si se une. Encuentra candidatos en{' '}
                      <Link href={`/jugadores?recruitment=LOOKING_FOR_TEAM${team.gameId ? `&game=${team.gameId}` : ''}`} className="text-neon hover:underline">
                        el buscador de jugadores
                      </Link>
                      . Las invitaciones caducan a los 14 días.
                    </p>
                    <InviteForm teamId={team.id} defaultUsername={invitee} />
                    {sent[i]!.length > 0 && (
                      <ul className="space-y-1 text-sm">
                        {sent[i]!.slice(0, 10).map((inv) => (
                          <li key={inv.id} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5">
                            <span className="min-w-0 flex-1 truncate">
                              {inv.player.user ? (
                                <Link href={`/jugadores/${inv.player.user.username}`} className="font-semibold hover:text-neon">
                                  {inv.player.nickname}
                                </Link>
                              ) : (
                                inv.player.nickname
                              )}{' '}
                              <span className="text-xs text-muted">· {formatDate(inv.createdAt)}</span>
                            </span>
                            <span className={`chip shrink-0 ${inv.status === 'ACCEPTED' ? 'text-lime' : inv.status === 'PENDING' ? 'text-neon' : ''}`}>
                              {INVITATION_STATUS_LABEL[inv.status]}
                            </span>
                            {inv.status === 'PENDING' && <CancelInvitationButton id={inv.id} />}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {owner && <AddMemberForm teamId={team.id} />}
                {owner && <AddGuestForm teamId={team.id} />}
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
