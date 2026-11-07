import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarClock, CalendarDays, Crown, Gamepad2, MapPin, Settings, Trophy, Users, Wifi } from 'lucide-react';
import { api, apiOrNull } from '@/lib/api';
import { getMe } from '@/lib/session';
import type { Team, TournamentDetail } from '@/lib/types';
import {
  COUNTRIES,
  flag,
  formatDate,
  formatDateTime,
  formatMoney,
  FORMAT_LABEL,
  LEVEL_LABEL,
  MODE_LABEL,
  PLATFORM_LABEL,
  REPUTATION_LABEL,
  VERIFICATION_LABEL,
} from '@/lib/format';
import { Avatar, ReputationPill, StatusBadge } from '@/components/ui';
import { VerifiedBadge } from '@/components/verified-badge';
import { TournamentLive } from '@/components/realtime';
import { RegistrationPanel } from '@/components/registration-panel';
import { ShareButton } from '@/components/share-button';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = await apiOrNull<TournamentDetail>(`/tournaments/${encodeURIComponent(slug)}`, { auth: false });
  if (!t) return { title: 'Partida no encontrada' };
  return {
    title: t.name,
    description: `${t.game?.name ?? t.sport?.name} · ${t.organizer.displayName} · ${formatDateTime(t.startsAt)}`,
    openGraph: { title: t.name, images: t.coverUrl ? [t.coverUrl] : undefined },
  };
}

export default async function TournamentPage({ params }: Props) {
  const { slug } = await params;
  const me = await getMe();
  const t = await apiOrNull<TournamentDetail>(`/tournaments/${encodeURIComponent(slug)}`);
  if (!t) notFound();
  const teams = me && t.mode === 'TEAM' ? await api<Team[]>('/me/teams').catch(() => []) : [];
  const ownedTeams = teams.filter((team) => team.ownerId === me?.id || team.captainId === me?.player?.id);
  const discipline = t.game ?? t.sport;
  const o = t.organizer;
  const accent = o.primaryColor ?? '#22d3ee';

  return (
    <div className="space-y-6">
      <TournamentLive tournamentId={t.id} />

      {/* Cabecera */}
      <section className="relative overflow-hidden rounded-3xl border border-line bg-surface">
        <div className="absolute inset-0">
          {t.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.coverUrl} alt="" className="size-full object-cover opacity-30" />
          ) : (
            <div className="size-full" style={{ background: `radial-gradient(800px 300px at 0% 0%, ${accent}40, transparent), radial-gradient(600px 300px at 100% 100%, #e879f930, transparent)` }} />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/70 to-transparent" />
        </div>
        <div className="relative flex flex-col gap-6 p-6 md:flex-row md:items-end md:p-10">
          <Avatar src={o.logoUrl} name={o.displayName} size={88} accent={accent} />
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={t.status} />
              <span className="chip">
                {t.category === 'ESPORT' ? <Gamepad2 className="size-3.5 text-neon-2" /> : <Trophy className="size-3.5 text-lime" />}
                {discipline?.name}
              </span>
              {t.platform && <span className="chip">{PLATFORM_LABEL[t.platform]}</span>}
            </div>
            {t.competition && <p className="text-sm font-semibold uppercase tracking-wider text-neon-2">{t.competition.name}</p>}
            <h1 className="text-4xl font-bold leading-tight md:text-5xl">{t.name}</h1>
            <div className="mt-2 flex items-center gap-1.5 text-sm text-muted">
              Organiza
              <Link href={`/organizer/${o.user.username}`} className="font-semibold text-ink hover:text-neon">
                {o.displayName}
              </Link>
              <VerifiedBadge organizer={o} />
            </div>
          </div>
          <div className="flex gap-2">
            <ShareButton title={t.name} />
            {t.viewer?.canManage && (
              <Link href={`/dashboard/torneos/${t.id}`} className="btn-ghost">
                <Settings className="size-4" /> Administrar
              </Link>
            )}
          </div>
        </div>
      </section>

      {t.status === 'CANCELLED' && (
        <div className="rounded-2xl border border-danger/50 bg-danger/10 p-4 text-sm text-danger">
          Esta partida fue cancelada. {t.cancelledReason && <>Motivo: {t.cancelledReason}</>}
        </div>
      )}
      {t.champion && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber/40 bg-amber/10 p-4">
          <Crown className="size-6 text-amber" />
          <span className="font-display text-xl font-bold">Campeón: {t.champion.team?.name ?? t.champion.player?.nickname}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {/* Datos clave */}
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Info icon={<CalendarDays />} label="Inicio" value={formatDateTime(t.startsAt)} />
            <Info icon={<CalendarClock />} label="Inscripción hasta" value={formatDateTime(t.registrationDeadline)} />
            <Info icon={t.isOnline ? <Wifi /> : <MapPin />} label="Lugar" value={t.isOnline ? 'Online' : `${t.location ?? ''}${t.city ? `, ${t.city}` : ''} ${flag(t.country)}`} />
            <Info icon={<Users />} label="Cupos" value={`${t.registeredCount}/${t.maxParticipants} · ${t.spotsLeft} libres`} />
            <Info icon={<Trophy />} label="Formato" value={FORMAT_LABEL[t.format]} />
            <Info icon={<Users />} label="Modalidad" value={MODE_LABEL[t.mode]} />
            <Info icon={<Trophy />} label="Cuota de inscripción" value={formatMoney(t.entryFee, t.currency)} />
            {(t.minLevel || t.maxLevel) && (
              <Info icon={<Gamepad2 />} label="Nivel requerido" value={`${t.minLevel ? LEVEL_LABEL[t.minLevel] : '—'} a ${t.maxLevel ? LEVEL_LABEL[t.maxLevel] : '—'}`} />
            )}
          </section>

          {t.description && (
            <Block title="Descripción">
              <p className="whitespace-pre-line text-muted">{t.description}</p>
            </Block>
          )}
          <Block title="Reglamento">
            {t.rules ? <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{t.rules}</p> : <p className="text-sm text-muted">El organizador no publicó un reglamento.</p>}
            {(t.format === 'ROUND_ROBIN' || t.format.startsWith('GROUPS')) && (
              <p className="mt-3 text-xs text-muted">
                Puntuación de la tabla: victoria {t.pointsWin} · empate {t.pointsDraw} · derrota {t.pointsLoss}
                {t.groupCount && ` · ${t.groupCount} grupos`}
                {t.qualifiersPerGroup && ` · clasifican ${t.qualifiersPerGroup} por grupo`}
              </p>
            )}
          </Block>

          <Block title={`Participantes (${t.registrations.length})`}>
            {t.registrations.length ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {t.registrations.map((r, i) => {
                  const name = r.team?.name ?? r.player?.nickname ?? '—';
                  const img = r.team?.logoUrl ?? r.player?.avatarUrl;
                  const country = r.team?.country ?? r.player?.country;
                  const href = r.team ? `/equipos/${r.team.slug}` : undefined;
                  return (
                    <li key={r.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-2.5">
                      <span className="w-6 text-center font-display text-sm font-bold text-muted">{r.seed ?? i + 1}</span>
                      <Avatar src={img} name={name} size={34} rounded={r.team ? 'xl' : 'full'} />
                      {href ? (
                        <Link href={href} className="truncate font-semibold hover:text-neon">{name}</Link>
                      ) : (
                        <span className="truncate font-semibold">{name}</span>
                      )}
                      <span className="ml-auto">{flag(country)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted">Todavía no hay participantes confirmados.</p>
            )}
          </Block>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          {/* Panel de confianza: verificación y reputación son indicadores independientes */}
          <section className="card p-5">
            <h2 className="mb-3 text-lg font-bold uppercase">Sobre el organizador</h2>
            <div className="flex items-center gap-3">
              <Avatar src={o.logoUrl} name={o.displayName} size={52} accent={accent} />
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <Link href={`/organizer/${o.user.username}`} className="truncate font-semibold hover:text-neon">{o.displayName}</Link>
                  <VerifiedBadge organizer={o} />
                </div>
                <p className="text-xs text-muted">
                  {flag(o.country)} {o.city}, {COUNTRIES[o.country] ?? o.country} · desde {formatDate(o.createdAt, { dateStyle: 'medium' })}
                </p>
              </div>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Verificación</dt>
                <dd className={o.verificationStatus === 'VERIFIED' ? 'font-semibold text-verified' : ''}>{VERIFICATION_LABEL[o.verificationStatus]}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Reputación</dt>
                <dd>
                  <ReputationPill reputation={o.reputation} compact />
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Nivel</dt>
                <dd>{REPUTATION_LABEL[o.reputation?.reputationLevel ?? 'NEW']}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Torneos publicados</dt>
                <dd>{o._count.tournaments}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Finalizados / cancelados</dt>
                <dd>
                  {t.organizerHistory.FINISHED ?? 0} / {t.organizerHistory.CANCELLED ?? 0}
                </dd>
              </div>
            </dl>
            {(o.reputation?.totalRatings ?? 0) < 10 && (
              <p className="mt-3 rounded-lg bg-surface-3 p-2 text-xs text-muted">
                Muestra pequeña: la reputación se consolida con al menos 10 valoraciones y 5 torneos completados.
              </p>
            )}
          </section>

          <RegistrationPanel
            tournament={{
              id: t.id,
              slug: t.slug,
              name: t.name,
              mode: t.mode,
              entryFee: t.entryFee,
              currency: t.currency,
              rules: t.rules,
              refundPolicy: t.refundPolicy,
              registrationOpen: t.registrationOpen,
              status: t.status,
              organizerName: o.displayName,
              organizerVerified: o.verificationStatus === 'VERIFIED',
              reputationScore: o.reputation?.totalRatings ? Number(o.reputation.averageScore).toFixed(2) : null,
              reputationCount: o.reputation?.totalRatings ?? 0,
            }}
            loggedIn={!!me}
            isOwner={!!t.viewer?.canManage}
            myRegistration={t.viewer?.myRegistration ?? null}
            teams={ownedTeams.map((team) => ({ id: team.id, name: team.name, members: team._count.members }))}
          />
        </aside>
      </div>
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="card p-3.5">
      <div className="mb-1 flex items-center gap-1.5 text-neon [&>svg]:size-4">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      </div>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-3 text-xl font-bold uppercase">{title}</h2>
      {children}
    </section>
  );
}
