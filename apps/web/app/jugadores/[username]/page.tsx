import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Award, Crown, Gamepad2, Lock, Medal, Pencil, Shirt, Swords, Trophy, Users } from 'lucide-react';
import { apiOrNull } from '@/lib/api';
import type { PlayerProfile, StatLine } from '@/lib/types';
import { COUNTRIES, flag, formatDate, RECRUITMENT_LABEL, STATUS_LABEL } from '@/lib/format';
import { Avatar } from '@/components/ui';
import { GameProfileCard } from '@/components/game-profile';

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const p = await apiOrNull<PlayerProfile>(`/players/${encodeURIComponent(username)}`, { auth: false });
  if (!p) return { title: 'Jugador no encontrado' };
  const games = p.gameProfiles.map((g) => g.game.name).join(', ');
  return { title: `${p.nickname} (@${p.username})`, description: games ? `Perfil gamer: ${games}` : 'Perfil de jugador en Arena' };
}

export default async function PlayerPage({ params }: Props) {
  const { username } = await params;
  const p = await apiOrNull<PlayerProfile>(`/players/${encodeURIComponent(username)}`);
  if (!p) notFound();
  const featured = p.gameProfiles.filter((g) => g.isFeatured || p.isOwner);

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <section className="relative overflow-hidden rounded-3xl border border-line bg-surface p-6 md:p-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ background: 'radial-gradient(700px 260px at 0% 0%, #22d3ee30, transparent), radial-gradient(500px 260px at 100% 100%, #e879f925, transparent)' }}
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar src={p.avatarUrl} name={p.nickname} size={96} rounded="full" accent="#22d3ee" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-4xl font-bold">{p.nickname}</h1>
            <p className="text-sm text-muted">
              @{p.username}
              {p.fullName && ` · ${p.fullName}`}
              {p.country && ` · ${flag(p.country)} ${p.city ? `${p.city}, ` : ''}${COUNTRIES[p.country] ?? p.country}`}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {p.recruitmentStatus === 'LOOKING_FOR_TEAM' && <span className="chip border-lime/40 text-lime">{RECRUITMENT_LABEL[p.recruitmentStatus]}</span>}
              {p.position && (
                <span className="chip">
                  <Shirt className="size-3.5" /> {p.position}
                  {p.jerseyNumber != null && ` · #${p.jerseyNumber}`}
                </span>
              )}
              {p.organizer && <span className="chip text-neon-2">También organiza: {p.organizer.displayName}</span>}
              <span className="chip">Miembro desde {formatDate(p.memberSince, { dateStyle: undefined, month: 'short', year: 'numeric' })}</span>
            </div>
          </div>
          {p.isOwner && (
            <Link href="/dashboard/juegos" className="btn-ghost self-start">
              <Pencil className="size-4" /> Editar perfil gamer
            </Link>
          )}
        </div>
        {p.bio && <p className="relative mt-4 max-w-3xl whitespace-pre-line text-sm text-muted">{p.bio}</p>}
        {p.availability && <p className="relative mt-2 text-xs text-muted">Disponibilidad: {p.availability}</p>}
        {p.isSuspended && <p className="relative mt-3 text-sm text-danger">Ficha suspendida temporalmente.</p>}
      </section>

      {/* Estadísticas */}
      {p.stats ? (
        <section className="space-y-3">
          <h2 className="text-xl font-bold uppercase">Estadísticas oficiales</h2>
          <StatTiles s={p.stats.overall} />
          {p.stats.byDiscipline.length > 1 && (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-surface-3 text-[11px] uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Disciplina</th>
                    <th className="px-2 py-2 text-center">Torneos</th>
                    <th className="px-2 py-2 text-center">Títulos</th>
                    <th className="px-2 py-2 text-center">PJ</th>
                    <th className="px-2 py-2 text-center">G-E-P</th>
                    <th className="px-2 py-2 text-center">% victorias</th>
                  </tr>
                </thead>
                <tbody>
                  {p.stats.byDiscipline.map((d) => (
                    <tr key={d.key} className="border-t border-line">
                      <td className="px-3 py-2 font-semibold">{d.label}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{d.tournamentsPlayed}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{d.tournamentsWon}</td>
                      <td className="px-2 py-2 text-center tabular-nums">{d.matchesPlayed}</td>
                      <td className="px-2 py-2 text-center tabular-nums">
                        {d.wins}-{d.draws}-{d.losses}
                      </td>
                      <td className="px-2 py-2 text-center tabular-nums">{d.winRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted">Solo cuentan torneos finalizados. En partidas por equipos se suman los torneos jugados como integrante.</p>
        </section>
      ) : (
        <Private label="Las estadísticas de este jugador son privadas." />
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          {/* Perfil gamer */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-xl font-bold uppercase">
              <Gamepad2 className="size-5 text-neon" /> Videojuegos
            </h2>
            {featured.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {featured.map((g) => (
                  <GameProfileCard key={g.id} profile={g} />
                ))}
              </div>
            ) : (
              <p className="card p-5 text-sm text-muted">Todavía no agregó videojuegos a su perfil.</p>
            )}
          </section>

          {/* Historial */}
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-xl font-bold uppercase">
              <Swords className="size-5 text-neon" /> Historial de torneos
            </h2>
            {p.history === null ? (
              <Private label="El historial de este jugador es privado." />
            ) : p.history.length ? (
              <ul className="space-y-2">
                {p.history.map((h) => (
                  <li key={h.tournament.slug} className="card flex items-center gap-3 p-3">
                    <Position value={h.finalPosition} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/torneos/${h.tournament.slug}`} className="block truncate font-semibold hover:text-neon">
                        {h.tournament.name}
                      </Link>
                      <p className="truncate text-xs text-muted">
                        {h.tournament.game?.name ?? h.tournament.sport?.name} · {h.tournament.organizer.displayName} ·{' '}
                        {formatDate(h.tournament.startsAt)} · {h.participants} participantes
                        {h.team && ` · con ${h.team.name}`}
                      </p>
                    </div>
                    {h.tournament.status !== 'FINISHED' && <span className="chip shrink-0 text-neon">{STATUS_LABEL[h.tournament.status]}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="card p-5 text-sm text-muted">Todavía no participó en torneos.</p>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          {/* Logros */}
          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold uppercase">
              <Award className="size-5 text-amber" /> Logros
            </h2>
            {p.achievements.length ? (
              <ul className="space-y-2">
                {p.achievements.map((a) => (
                  <li key={a.achievement.code} className="flex items-start gap-2.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-amber/15 text-amber">
                      {a.achievement.code === 'CHAMPION' ? <Crown className="size-4" /> : <Medal className="size-4" />}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{a.achievement.name}</p>
                      <p className="text-xs text-muted">
                        {a.achievement.description} · {formatDate(a.unlockedAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Aún sin logros desbloqueados.</p>
            )}
          </section>

          {/* Equipos */}
          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold uppercase">
              <Users className="size-5 text-neon" /> Equipos
            </h2>
            {p.teams === null ? (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Lock className="size-4" /> Información privada.
              </p>
            ) : p.teams.length ? (
              <ul className="space-y-2">
                {p.teams.map((m) => (
                  <li key={`${m.team.id}-${m.joinedAt}`} className={`flex items-center gap-3 ${m.leftAt ? 'opacity-60' : ''}`}>
                    <Avatar src={m.team.logoUrl} name={m.team.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/equipos/${m.team.slug}`} className="block truncate text-sm font-semibold hover:text-neon">
                        {m.team.name} {m.isCaptain && !m.leftAt && <Crown className="inline size-3.5 text-amber" aria-label="Capitán" />}
                      </Link>
                      <p className="truncate text-xs text-muted">
                        {[m.role, m.team.game?.name ?? m.team.sport?.name].filter(Boolean).join(' · ')}
                        {m.leftAt ? ` · hasta ${formatDate(m.leftAt)}` : ` · desde ${formatDate(m.joinedAt)}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No pertenece a ningún equipo.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function StatTiles({ s }: { s: StatLine }) {
  const tiles = [
    { label: 'Torneos', value: s.tournamentsPlayed, icon: <Trophy /> },
    { label: 'Títulos', value: s.tournamentsWon, icon: <Crown /> },
    { label: 'Podios', value: s.podiums, icon: <Medal /> },
    { label: 'Encuentros', value: s.matchesPlayed, icon: <Swords /> },
    { label: 'G - E - P', value: `${s.wins}-${s.draws}-${s.losses}`, icon: <Gamepad2 /> },
    { label: '% victorias', value: `${s.winRate}%`, icon: <Award /> },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((t) => (
        <div key={t.label} className="card p-3.5">
          <div className="mb-1 flex items-center gap-1.5 text-neon [&>svg]:size-4">
            {t.icon}
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{t.label}</span>
          </div>
          <p className="font-display text-2xl font-bold tabular-nums">{t.value}</p>
        </div>
      ))}
    </div>
  );
}

function Position({ value }: { value: number | null }) {
  if (!value) return <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-3 text-xs text-muted">—</span>;
  const color = value === 1 ? 'bg-amber/20 text-amber' : value <= 3 ? 'bg-neon/15 text-neon' : 'bg-surface-3 text-muted';
  return <span className={`grid size-10 shrink-0 place-items-center rounded-xl font-display text-sm font-bold ${color}`}>{value}.º</span>;
}

function Private({ label }: { label: string }) {
  return (
    <p className="card flex items-center gap-2 p-5 text-sm text-muted">
      <Lock className="size-4" /> {label}
    </p>
  );
}
