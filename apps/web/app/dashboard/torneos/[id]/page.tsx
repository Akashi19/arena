import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { api, apiOrNull } from '@/lib/api';
import { requireOrganizer } from '@/lib/session';
import type { Discipline, Fixture, Paginated, RegistrationStatus, TournamentDetail } from '@/lib/types';
import { formatDateTime, formatMoney } from '@/lib/format';
import { StatusBadge } from '@/components/ui';
import { ImageUpload } from '@/components/forms';
import { TournamentForm } from '@/components/tournament-form';
import { TournamentLive } from '@/components/realtime';
import { RegistrationsManager, StatusActions, type ManagedRegistration } from './manage';
import { FixtureManager } from './fixture-manager';

export const metadata: Metadata = { title: 'Administrar partida' };

export default async function ManageTournamentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creada?: string; tab?: string; estado?: RegistrationStatus }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  await requireOrganizer(`/dashboard/torneos/${id}`);
  const t = await apiOrNull<TournamentDetail>(`/tournaments/${id}`);
  if (!t || !t.viewer?.canManage) notFound();

  const started = t.status === 'IN_PROGRESS' || t.status === 'FINISHED';
  const tab = sp.tab ?? (started ? 'fixture' : 'inscripciones');
  const [regs, sports, games, sub, fixture] = await Promise.all([
    api<Paginated<ManagedRegistration>>(`/tournaments/${id}/registrations`, { query: { status: sp.estado, pageSize: 100 } }),
    tab === 'editar' ? api<Discipline[]>('/sports', { auth: false }) : Promise.resolve([]),
    tab === 'editar' ? api<(Discipline & { platforms: string[] })[]>('/games', { auth: false }) : Promise.resolve([]),
    tab === 'editar' ? api<{ usage: { participantsPerTournament: { limit: number } } }>('/me/subscription') : Promise.resolve(null),
    tab === 'fixture' && started ? api<Fixture>(`/tournaments/${id}/fixture`) : Promise.resolve(null),
  ]);
  const editable = t.status !== 'FINISHED' && t.status !== 'CANCELLED';

  return (
    <div className="space-y-5">
      <TournamentLive tournamentId={t.id} />
      {sp.creada && (
        <div className="rounded-2xl border border-lime/40 bg-lime/10 p-4 text-sm text-lime">
          ¡Partida creada! Comparte el enlace público:{' '}
          <Link href={`/torneos/${t.slug}`} className="font-semibold underline">/torneos/{t.slug}</Link>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <StatusBadge status={t.status} />
            <span className="text-sm text-muted">{t.game?.name ?? t.sport?.name}</span>
          </div>
          <h1 className="text-3xl font-bold">{t.name}</h1>
          <p className="text-sm text-muted">
            {formatDateTime(t.startsAt)} · {t.registeredCount}/{t.maxParticipants} inscritos · {formatMoney(t.entryFee, t.currency)}
          </p>
        </div>
        <Link href={`/torneos/${t.slug}`} className="btn-ghost">
          <ExternalLink className="size-4" /> Ver página pública
        </Link>
      </div>

      <StatusActions id={t.id} status={t.status} />

      <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-line px-1">
        {[
          ...(started ? [['fixture', 'Fixture y resultados']] : []),
          ['inscripciones', `Inscripciones`],
          ...(editable ? [['editar', 'Editar partida']] : []),
          ['portada', 'Portada'],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={`/dashboard/torneos/${id}?tab=${key}`}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === key ? 'border-neon text-neon' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === 'fixture' && fixture && <FixtureManager fixture={fixture} />}
      {tab === 'inscripciones' && (
        <RegistrationsManager tournamentId={t.id} mode={t.mode} status={t.status} registrations={regs.items} filter={sp.estado} />
      )}
      {tab === 'editar' && editable && sub && (
        <TournamentForm sports={sports} games={games} maxParticipantsLimit={sub.usage.participantsPerTournament.limit} initial={t} />
      )}
      {tab === 'portada' && (
        <div className="card max-w-xl p-5">
          <ImageUpload target="cover" id={t.id} current={t.coverUrl} label="Imagen de portada" shape="wide" />
        </div>
      )}
    </div>
  );
}
