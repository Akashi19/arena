import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarClock, Gamepad2, MapPin, Settings, Trophy, Tv, UserRound } from 'lucide-react';
import { apiOrNull } from '@/lib/api';
import type { MatchStreamDetail, MatchStreamInfo } from '@/lib/types';
import { BRACKET_LABEL, formatDateTime, MATCH_STATUS_LABEL } from '@/lib/format';
import { entrantImage, entrantName, formatScore } from '@/lib/fixture';
import { Avatar } from '@/components/ui';
import { PrivateNote, StreamBadge, WatchLink } from '@/components/stream';
import { StreamPlayer } from '@/components/stream-player';
import { TournamentLive } from '@/components/realtime';

type Props = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(id: string) {
  if (!UUID.test(id)) return null;
  return apiOrNull<MatchStreamDetail>(`/matches/${id}/stream`);
}

const vs = (d: MatchStreamDetail) => {
  const [a, b] = [1, 2].map((s) => d.match.participants.find((p) => p.slot === s));
  return `${entrantName(a?.registration)} vs ${entrantName(b?.registration)}`;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = await load((await params).id);
  if (!d) return { title: 'Encuentro no encontrado' };
  return {
    title: `${vs(d)} · ${d.tournament.name}`,
    description: `${d.tournament.game?.name ?? d.tournament.sport?.name} · ${d.tournament.organizer.displayName}${d.stream && d.stream.status !== 'CANCELLED' ? ` · Transmisión en ${d.stream.platformName}` : ''}`,
  };
}

export default async function MatchPage({ params }: Props) {
  const { id } = await params;
  const d = await load(id);
  if (!d) notFound();
  const { match, tournament: t } = d;
  const [home, away] = [1, 2].map((s) => match.participants.find((p) => p.slot === s));
  const team = t.mode === 'TEAM';
  const done = match.status === 'COMPLETED';
  const discipline = t.game?.name ?? t.sport?.name ?? '—';
  const round = match.groupLabel ? `Grupo ${match.groupLabel} · Fecha ${match.round}` : `${BRACKET_LABEL[match.bracket]} · Ronda ${match.round}`;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <TournamentLive tournamentId={t.id} />
      <p className="text-sm text-muted">
        <Link href={`/torneos/${t.slug}`} className="hover:text-ink">
          {t.name}
        </Link>{' '}
        / {round}
      </p>

      {/* Marcador */}
      <section className={`card p-5 md:p-8 ${match.status === 'LIVE' || d.streamStatus === 'LIVE' ? 'border-danger/50' : ''}`}>
        <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
          <span className="chip">{MATCH_STATUS_LABEL[match.status]}</span>
          {d.streamStatus !== 'NOT_CONFIGURED' && <StreamBadge status={d.streamStatus} />}
        </div>
        <h1 className="sr-only">{vs(d)}</h1>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 md:gap-6">
          {[home, away].map((p, i) => {
            const name = entrantName(p?.registration);
            const href = p?.registration.team ? `/equipos/${p.registration.team.slug}` : p?.registration.player?.user ? `/jugadores/${p.registration.player.user.username}` : undefined;
            const cell = (
              <span className={`flex min-w-0 flex-col items-center gap-2 text-center ${p?.isWinner === false && done ? 'opacity-60' : ''}`}>
                <Avatar src={entrantImage(p?.registration)} name={name} size={64} rounded={team ? 'xl' : 'full'} />
                <span className="w-full truncate font-display text-lg font-bold md:text-2xl">{name}</span>
              </span>
            );
            return (
              <div key={i} className={i === 0 ? 'order-1 min-w-0' : 'order-3 min-w-0'}>
                {href ? (
                  <Link href={href} className="block hover:text-neon">
                    {cell}
                  </Link>
                ) : (
                  cell
                )}
              </div>
            );
          })}
          <div className="order-2 text-center">
            <p className="font-display text-4xl font-bold tabular-nums md:text-6xl">
              {done || (match.status === 'LIVE' && home?.score != null && away?.score != null)
                ? `${formatScore(home?.score ?? null)} - ${formatScore(away?.score ?? null)}`
                : 'vs'}
            </p>
            {match.result && match.result.version > 1 && <p className="text-xs text-amber">Resultado corregido</p>}
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Transmisión en vivo */}
        <section className="card min-w-0 space-y-4 p-5" aria-labelledby="stream-title">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="stream-title" className="mr-auto text-xl font-bold uppercase">
              Transmisión en vivo
            </h2>
            {d.canManage && (
              <Link href={`/dashboard/torneos/${t.id}/encuentros/${match.id}`} className="btn-ghost px-3 py-1.5 text-xs">
                <Settings className="size-3.5" /> Gestionar transmisión
              </Link>
            )}
          </div>
          {d.stream ? (
            <StreamBlock stream={d.stream} fallbackTitle={vs(d)} />
          ) : (
            <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted">Este encuentro no tiene transmisión configurada.</p>
          )}
          {d.rebroadcasts.length > 0 && (
            <div className="space-y-3 border-t border-line pt-4">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Otras señales</h3>
              {d.rebroadcasts.map((s) => (
                <div key={s.id} className="rounded-xl bg-surface-2 p-3">
                  <StreamBlock stream={s} fallbackTitle={vs(d)} compact />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Ficha del encuentro */}
        <aside className="card h-fit p-5">
          <h2 className="mb-3 text-lg font-bold uppercase">Encuentro</h2>
          <dl className="space-y-3 text-sm">
            <Row icon={<Gamepad2 />} label={t.game ? 'Videojuego' : 'Deporte'} value={discipline} />
            <Row
              icon={<Trophy />}
              label="Torneo"
              value={
                <Link href={`/torneos/${t.slug}`} className="hover:text-neon">
                  {t.name}
                </Link>
              }
            />
            <Row icon={<CalendarClock />} label="Fecha" value={match.scheduledAt ? formatDateTime(match.scheduledAt) : 'Por programar'} />
            {match.venue && <Row icon={<MapPin />} label="Sede" value={match.venue} />}
            <Row icon={<Trophy />} label="Estado" value={MATCH_STATUS_LABEL[match.status]} />
            <Row icon={<Trophy />} label="Resultado" value={done ? `${formatScore(home?.score ?? null)} - ${formatScore(away?.score ?? null)}` : 'Pendiente'} />
            <Row
              icon={<UserRound />}
              label="Organizador"
              value={
                <Link href={`/organizer/${t.organizer.user.username}`} className="hover:text-neon">
                  {t.organizer.displayName}
                </Link>
              }
            />
            <Row icon={<Tv />} label="Transmisión" value={d.streamStatus === 'NOT_CONFIGURED' ? 'Sin transmisión' : <StreamBadge status={d.streamStatus} />} />
          </dl>
        </aside>
      </div>
    </div>
  );
}

function StreamBlock({ stream: s, fallbackTitle, compact = false }: { stream: MatchStreamInfo; fallbackTitle: string; compact?: boolean }) {
  const when = s.status === 'LIVE' && s.actualStartAt ? `En vivo desde ${formatDateTime(s.actualStartAt)}` : s.scheduledStartAt ? formatDateTime(s.scheduledStartAt) : null;
  const playable = s.url && s.embed && (s.status === 'LIVE' || s.status === 'ENDED' || s.status === 'SCHEDULED');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StreamBadge status={s.status} />
        <span className="text-sm font-semibold">{s.platformName}</span>
        {when && (
          <span className="flex items-center gap-1 text-xs text-muted">
            <CalendarClock className="size-3" aria-hidden /> {when}
            {s.scheduledEndAt && s.status === 'SCHEDULED' && ` – ${formatDateTime(s.scheduledEndAt)}`}
          </span>
        )}
        <span className="ml-auto">{s.url ? <WatchLink url={s.url} platformName={s.platformName} compact={compact} /> : s.restricted && <PrivateNote />}</span>
      </div>
      <div>
        <p className={compact ? 'text-sm font-semibold' : 'text-lg font-semibold'}>{s.title ?? fallbackTitle}</p>
        {s.description && <p className="mt-1 whitespace-pre-line text-sm text-muted">{s.description}</p>}
      </div>
      {s.status === 'CANCELLED' && <p className="text-sm text-muted">La transmisión fue cancelada.</p>}
      {playable && !compact && <StreamPlayer embed={s.embed!} url={s.url!} platformName={s.platformName} title={s.title ?? fallbackTitle} />}
      {s.url && !s.embed && !compact && (
        <p className="text-xs text-muted">{s.platformName} no permite reproducir esta transmisión dentro de Arena: se abre en la plataforma.</p>
      )}
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="flex items-center gap-1.5 text-muted [&>svg]:size-3.5">
        {icon}
        {label}
      </dt>
      <dd className="min-w-0 text-right font-semibold">{value}</dd>
    </div>
  );
}
