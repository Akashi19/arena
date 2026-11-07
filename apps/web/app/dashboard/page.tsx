import type { Metadata } from 'next';
import Link from 'next/link';
import { PlusCircle, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { requireMe } from '@/lib/session';
import { formatDateTime, formatMoney, REPUTATION_LABEL, STATUS_LABEL, VERIFICATION_LABEL } from '@/lib/format';
import type { ReputationLevel, TournamentStatus, VerificationStatus } from '@/lib/types';
import { Avatar, EmptyState, Stat, StatusBadge } from '@/components/ui';

export const metadata: Metadata = { title: 'Mi panel' };

interface DashboardData {
  organizer: { displayName: string; logoUrl: string | null; verificationStatus: VerificationStatus };
  kpis: {
    totalTournaments: number;
    activeTournaments: number;
    draftTournaments: number;
    finishedTournaments: number;
    cancelledTournaments: number;
    teams: number;
    players: number;
    registrationsReceived: number;
    registrationsPending: number;
    registrationsApproved: number;
    spotsAvailable: number;
    entryFeesRegistered: { currency: string; total: string }[];
  };
  tournamentsByStatus: Partial<Record<TournamentStatus, number>>;
  registrationsByMonth: { month: string; registrations: number }[];
  upcoming: { id: string; name: string; slug: string; status: TournamentStatus; startsAt: string; maxParticipants: number; registeredCount: number }[];
  reputation: { averageScore: string; totalRatings: number; reputationLevel: ReputationLevel } | null;
  subscription: {
    plan: { code: string; name: string };
    usage: { activeTournaments: { used: number; limit: number | null }; participantsPerTournament: { used: number; limit: number } };
  };
}

export default async function DashboardPage() {
  const me = await requireMe('/dashboard');
  if (!me.organizerProfile) {
    return (
      <div className="space-y-6">
        <h1 className="section-title">Hola, {me.player?.nickname ?? me.username}</h1>
        <div className="grid gap-4 md:grid-cols-3">
          <Link href="/torneos" className="card p-5 hover:border-neon/50">
            <h2 className="text-xl font-bold">Buscar torneos</h2>
            <p className="text-sm text-muted">Encuentra partidas abiertas y solicita tu inscripción.</p>
          </Link>
          <Link href="/dashboard/inscripciones" className="card p-5 hover:border-neon/50">
            <h2 className="text-xl font-bold">Mis inscripciones</h2>
            <p className="text-sm text-muted">Consulta el estado de tus solicitudes.</p>
          </Link>
          <Link href="/dashboard/perfil?activar=organizador" className="card border-neon-2/40 p-5 hover:border-neon-2">
            <h2 className="text-xl font-bold text-neon-2">Organiza tus torneos</h2>
            <p className="text-sm text-muted">Activa tu perfil de organizador gratis.</p>
          </Link>
        </div>
      </div>
    );
  }

  const d = await api<DashboardData>('/me/dashboard');
  const k = d.kpis;
  const maxMonth = Math.max(1, ...d.registrationsByMonth.map((m) => m.registrations));
  const totalByStatus = Math.max(1, Object.values(d.tournamentsByStatus).reduce((a, n) => a + (n ?? 0), 0));
  const limit = d.subscription.usage.activeTournaments;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar src={d.organizer.logoUrl} name={d.organizer.displayName} size={56} />
          <div>
            <h1 className="text-3xl font-bold">{d.organizer.displayName}</h1>
            <p className="text-sm text-muted">
              Plan {d.subscription.plan.name} · Verificación: {VERIFICATION_LABEL[d.organizer.verificationStatus]} · {REPUTATION_LABEL[d.reputation?.reputationLevel ?? 'NEW']}
            </p>
          </div>
        </div>
        <Link href="/dashboard/torneos/nuevo" className="btn-primary">
          <PlusCircle className="size-4" /> Crear partida
        </Link>
      </div>

      {limit.limit !== null && limit.used >= limit.limit && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber/50 bg-amber/10 p-4 text-sm text-amber">
          <Sparkles className="mt-0.5 size-5 shrink-0" />
          <p>
            Usas {limit.used} de {limit.limit} torneos activos de tu plan {d.subscription.plan.name}.{' '}
            <Link href="/dashboard/suscripcion" className="font-semibold underline">Actualiza tu plan</Link> para crear más.
          </p>
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Partidas creadas" value={k.totalTournaments} hint={`${k.draftTournaments} borradores`} />
        <Stat label="Partidas activas" value={k.activeTournaments} hint={limit.limit !== null ? `Límite del plan: ${limit.limit}` : 'Sin límite'} accent="lime" />
        <Stat label="Finalizadas" value={k.finishedTournaments} hint={`${k.cancelledTournaments} canceladas`} accent="neon-2" />
        <Stat label="Inscripciones" value={k.registrationsReceived} hint={`${k.registrationsPending} pendientes`} accent="amber" />
        <Stat label="Equipos" value={k.teams} />
        <Stat label="Jugadores" value={k.players} accent="neon-2" />
        <Stat label="Cupos disponibles" value={k.spotsAvailable} hint="En partidas abiertas" accent="lime" />
        <Stat
          label="Cuotas registradas"
          value={k.entryFeesRegistered.length ? formatMoney(k.entryFeesRegistered[0]!.total, k.entryFeesRegistered[0]!.currency) : '—'}
          hint={k.entryFeesRegistered.slice(1).map((f) => formatMoney(f.total, f.currency)).join(' · ') || 'Informativas, inscripciones aprobadas'}
          accent="amber"
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-4 text-lg font-bold uppercase">Inscripciones por mes</h2>
          {d.registrationsByMonth.length ? (
            <div className="flex h-44 items-end gap-2" role="img" aria-label="Gráfico de inscripciones por mes">
              {d.registrationsByMonth.map((m) => (
                <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-xs font-semibold tabular-nums">{m.registrations}</span>
                  <div className="w-full max-w-10 rounded-t-md bg-gradient-to-t from-neon/40 to-neon" style={{ height: `${(m.registrations / maxMonth) * 120}px` }} />
                  <span className="text-[10px] text-muted">{m.month.slice(5)}/{m.month.slice(2, 4)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">Aún no hay inscripciones.</p>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-4 text-lg font-bold uppercase">Partidas por estado</h2>
          <div className="space-y-3">
            {(Object.keys(STATUS_LABEL) as TournamentStatus[]).map((s) => {
              const n = d.tournamentsByStatus[s] ?? 0;
              return (
                <div key={s}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-muted">{STATUS_LABEL[s]}</span>
                    <span className="font-semibold tabular-nums">{n}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-gradient-to-r from-neon to-neon-2" style={{ width: `${(n / totalByStatus) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-bold uppercase">Próximas partidas</h2>
        {d.upcoming.length ? (
          <ul className="space-y-2">
            {d.upcoming.map((t) => (
              <li key={t.id}>
                <Link href={`/dashboard/torneos/${t.id}`} className="card flex flex-wrap items-center gap-3 p-4 hover:border-neon/50">
                  <StatusBadge status={t.status} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{t.name}</span>
                  <span className="text-sm text-muted">{formatDateTime(t.startsAt)}</span>
                  <span className="text-sm tabular-nums">
                    {t.registeredCount}/{t.maxParticipants}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No tienes partidas activas" action={<Link href="/dashboard/torneos/nuevo" className="btn-primary">Crear partida</Link>} />
        )}
      </section>
    </div>
  );
}
