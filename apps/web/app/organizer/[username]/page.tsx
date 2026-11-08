import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarDays, Crown, Globe, MapPin } from 'lucide-react';
import { apiOrNull } from '@/lib/api';
import type { OrganizerPublic, Paginated, RatingItem, TournamentStatus } from '@/lib/types';
import { COUNTRIES, flag, formatDate, ORGANIZER_TYPE_LABEL, REPUTATION_LABEL, VERIFICATION_LABEL } from '@/lib/format';
import { Avatar, EmptyState, ReputationPill, Stat, StatusBadge } from '@/components/ui';
import { VerifiedBadge } from '@/components/verified-badge';
import { RatingCard } from '@/components/trust';

interface MiniTournament {
  id: string;
  name: string;
  slug: string;
  status: TournamentStatus;
  startsAt: string;
  category: string;
  coverUrl: string | null;
  maxParticipants: number;
  sport: { name: string } | null;
  game: { name: string } | null;
  _count: { registrations: number };
  champion?: { team: { name: string } | null; player: { nickname: string } | null } | null;
}

interface ProfileData {
  organizer: OrganizerPublic & { description: string | null; bannerUrl: string | null; website: string | null; socialLinks: Record<string, string>; createdAt: string };
  stats: { tournamentsOrganized: number; finished: number; cancelled: number; active: number; teamsParticipating: number };
  upcoming: MiniTournament[];
  history: MiniTournament[];
}

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const data = await apiOrNull<ProfileData>(`/organizers/${encodeURIComponent(username)}`, { auth: false });
  return { title: data ? data.organizer.displayName : 'Organizador no encontrado' };
}

const SOCIAL_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  x: 'X',
  youtube: 'YouTube',
  twitch: 'Twitch',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  discord: 'Discord',
  kick: 'Kick',
};

export default async function OrganizerPage({ params }: Props) {
  const { username } = await params;
  const data = await apiOrNull<ProfileData>(`/organizers/${encodeURIComponent(username)}`, { auth: false });
  if (!data) notFound();
  const { organizer: o, stats } = data;
  const accent = o.primaryColor ?? '#22d3ee';
  const due = stats.finished + stats.cancelled;
  const ratings = await apiOrNull<Paginated<RatingItem>>(`/organizers/${o.id}/ratings`, { auth: false, query: { pageSize: 3 } });

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-line bg-surface">
        <div className="h-40 md:h-56">
          {o.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={o.bannerUrl} alt="" className="size-full object-cover" />
          ) : (
            <div className="size-full" style={{ background: `linear-gradient(120deg, ${accent}55, #e879f933 60%, transparent), repeating-linear-gradient(45deg, #ffffff08 0 12px, transparent 12px 24px)` }} />
          )}
        </div>
        <div className="flex flex-col gap-4 p-6 md:flex-row md:items-end md:p-8">
          <div className="-mt-20 rounded-2xl bg-surface p-1.5 md:-mt-24">
            <Avatar src={o.logoUrl} name={o.displayName} size={120} accent={accent} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-4xl font-bold">{o.displayName}</h1>
              <VerifiedBadge organizer={o} size={24} />
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              <span className="flex items-center gap-1">
                <MapPin className="size-4" /> {o.city}, {COUNTRIES[o.country] ?? o.country} {flag(o.country)}
              </span>
              <span className="flex items-center gap-1">
                <CalendarDays className="size-4" /> En Arena desde {formatDate(o.createdAt)}
              </span>
              <span>{ORGANIZER_TYPE_LABEL[o.organizerType]}</span>
              <span>@{o.user.username}</span>
            </p>
            <div className="mt-2">
              <ReputationPill reputation={o.reputation} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {o.website && (
              <a href={o.website} target="_blank" rel="noopener noreferrer nofollow" className="btn-ghost px-3 py-2 text-xs">
                <Globe className="size-4" /> Sitio web
              </a>
            )}
            {Object.entries(o.socialLinks ?? {}).map(([k, url]) => (
              <a key={k} href={url} target="_blank" rel="noopener noreferrer nofollow" className="btn-ghost px-3 py-2 text-xs">
                {SOCIAL_LABEL[k] ?? k}
              </a>
            ))}
          </div>
        </div>
        {o.description && <p className="max-w-3xl whitespace-pre-line px-6 pb-8 text-muted md:px-8">{o.description}</p>}
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Torneos organizados" value={stats.tournamentsOrganized} />
        <Stat label="Activos" value={stats.active} accent="lime" />
        <Stat label="Completados" value={due ? `${Math.round((stats.finished / due) * 100)}%` : '—'} hint={`${stats.finished} finalizados · ${stats.cancelled} cancelados`} accent="neon-2" />
        <Stat label="Equipos participantes" value={stats.teamsParticipating} accent="amber" />
        <div className="card col-span-2 p-4 md:col-span-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Confianza</p>
          <p className="mt-1 text-sm">
            Verificación: <b className={o.verificationStatus === 'VERIFIED' ? 'text-verified' : ''}>{VERIFICATION_LABEL[o.verificationStatus]}</b>
          </p>
          <p className="text-sm">Nivel: {REPUTATION_LABEL[o.reputation?.reputationLevel ?? 'NEW']}</p>
          <p className="mt-1 text-xs text-muted">{o.reputation?.totalRatings ?? 0} valoraciones válidas</p>
          <Link href={`/organizer/${o.user.username}/trust`} className="mt-1 inline-block text-xs font-semibold text-neon hover:underline">
            Centro de confianza →
          </Link>
        </div>
      </section>

      <section>
        <h2 className="section-title mb-4">Próximas competiciones</h2>
        {data.upcoming.length ? <List items={data.upcoming} /> : <EmptyState title="Sin competiciones próximas" />}
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <h2 className="section-title">Opiniones de participantes</h2>
          <Link href={`/organizer/${o.user.username}/trust`} className="text-sm text-neon hover:underline">
            Ver todas ({ratings?.total ?? 0})
          </Link>
        </div>
        {ratings?.items.length ? (
          <div className="grid gap-3 lg:grid-cols-3">
            {ratings.items.map((r) => (
              <RatingCard key={r.id} rating={r} />
            ))}
          </div>
        ) : (
          <EmptyState title="Aún sin opiniones">Los participantes pueden valorar al organizador cuando finaliza una partida.</EmptyState>
        )}
      </section>

      <section>
        <h2 className="section-title mb-4">Historial de torneos</h2>
        {data.history.length ? <List items={data.history} showChampion /> : <EmptyState title="Aún sin historial" />}
      </section>
    </div>
  );
}

function List({ items, showChampion = false }: { items: MiniTournament[]; showChampion?: boolean }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map((t) => (
        <Link key={t.id} href={`/torneos/${t.slug}`} className="card flex items-center gap-4 p-4 transition hover:border-neon/50">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <StatusBadge status={t.status} />
              <span className="text-xs text-muted">{t.game?.name ?? t.sport?.name}</span>
            </div>
            <p className="truncate font-semibold">{t.name}</p>
            <p className="text-xs text-muted">
              {formatDate(t.startsAt)} · {t._count.registrations}/{t.maxParticipants} participantes
            </p>
          </div>
          {showChampion && t.champion && (
            <span className="flex items-center gap-1 text-xs text-amber">
              <Crown className="size-4" /> {t.champion.team?.name ?? t.champion.player?.nickname}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
