import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { api, qs } from '@/lib/api';
import type { Discipline, Paginated, RankingParticipant, RankingTable } from '@/lib/types';
import { formatDateTime, RANKING_EVENT_LABEL, REPORT_STATUS_LABEL } from '@/lib/format';
import { Pagination } from '@/components/ui';
import { adjustmentAction, reviewReportAction, revertEventAction, suspensionAction } from '@/app/actions';
import { ActionForm } from '../forms';
import { RankingAdminTabs } from '../tabs';

export const metadata: Metadata = { title: 'Rankings · Revisión' };

type Report = {
  id: string;
  reason: string;
  status: 'OPEN' | 'UPHELD' | 'DISMISSED';
  resolution: string | null;
  createdAt: string;
  reporter: { username: string };
  match: {
    id: string;
    round: number;
    tournament: { name: string; slug: string; game: { name: string } | null };
    participants: { slot: number; score: string | null; isWinner: boolean | null; registration: { player: { nickname: string } | null; team: { name: string } | null } }[];
    results: { version: number; status: string; scores: Record<string, number>; correctionReason: string | null; createdAt: string; confirmedBy: { username: string } }[];
    _count: { rankingEvents: number };
  };
};
type EventRow = {
  id: string;
  eventType: string;
  rankingType: 'PLAYER' | 'TEAM';
  participantId: string;
  pointsAwarded: number;
  placement: number | null;
  scoringRulesVersion: number;
  isReverted: boolean;
  revertedById: string | null;
  revertReason: string | null;
  createdAt: string;
  participant: RankingParticipant | null;
  game: { name: string };
  tournament: { name: string; slug: string } | null;
  match: { round: number; results: { version: number; confirmedBy: { username: string } }[] } | null;
};
type Anomalies = {
  repeatedPairings: { participants: { name: string; type: string }[]; matches: number; tournaments: number; winner: { name: string } }[];
  organizerConcentration: { participant: { name: string; type: string }; organizer: string; share: number; points: number; tournaments: number }[];
};
type Audit = { id: string; action: string; entityType: string; entityId: string; reason: string; createdAt: string; administrator: { username: string }; newValue: unknown };

const Reason = ({ name = 'reason', placeholder = 'Justificación (auditoría)' }: { name?: string; placeholder?: string }) => (
  <input name={name} required minLength={5} maxLength={1000} placeholder={placeholder} className="input min-w-0 flex-1 basis-56" />
);

export default async function RankingReviewPage({ searchParams }: { searchParams: Promise<{ game?: string; participant?: string; status?: string; page?: string; epage?: string }> }) {
  const sp = await searchParams;
  const games = await api<Discipline[]>('/games', { auth: false });
  const game = games.find((g) => g.id === sp.game) ?? games[0];
  const status = sp.status === 'ALL' ? undefined : (sp.status ?? 'OPEN');
  const [reports, anomalies, events, audit, players, teams] = await Promise.all([
    api<Paginated<Report>>('/admin/ranking/reports', { query: { status, pageSize: 10, page: sp.page } }),
    api<Anomalies>('/admin/ranking/anomalies', { query: { game: game.id } }),
    api<Paginated<EventRow>>('/admin/ranking/events', { query: { game: game.id, participant: sp.participant, page: sp.epage, pageSize: 20 } }),
    api<Paginated<Audit>>('/admin/ranking/audit', { query: { pageSize: 15 } }),
    api<RankingTable>('/rankings', { auth: false, query: { game: game.id, type: 'PLAYER', pageSize: 100 } }),
    api<RankingTable>('/rankings', { auth: false, query: { game: game.id, type: 'TEAM', pageSize: 100 } }),
  ]);
  const participantOptions = [
    ...[...players.items, ...players.provisional].map((r) => ({ type: 'PLAYER', id: r.participantId, name: r.participant?.name ?? r.participantId })),
    ...[...teams.items, ...teams.provisional].map((r) => ({ type: 'TEAM', id: r.participantId, name: `${r.participant?.name ?? r.participantId} (equipo)` })),
  ];
  const base = { game: game.id, participant: sp.participant, status: sp.status };

  return (
    <div className="space-y-8">
      <RankingAdminTabs />
      <form className="flex flex-wrap gap-2">
        <select name="game" defaultValue={game.id} className="input w-auto" aria-label="Videojuego">
          {games.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <button className="btn-ghost">Cambiar juego</button>
      </form>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold">Resultados reportados</h2>
          {['OPEN', 'UPHELD', 'DISMISSED', 'ALL'].map((s) => (
            <Link key={s} href={`/admin/rankings/revision${qs({ ...base, status: s })}`} className={(sp.status ?? 'OPEN') === s ? 'chip border-neon text-neon' : 'chip'}>
              {s === 'ALL' ? 'Todos' : REPORT_STATUS_LABEL[s]}
            </Link>
          ))}
        </div>
        <p className="text-xs text-muted">
          Si procede, se revierten los puntos de ranking de ese encuentro; el resultado original y sus versiones se conservan siempre.
        </p>
        {reports.items.length ? (
          <ul className="space-y-2">
            {reports.items.map((r) => (
              <li key={r.id} className="card space-y-2 p-4 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="chip">{REPORT_STATUS_LABEL[r.status]}</span>
                  <Link href={`/torneos/${r.match.tournament.slug}`} className="font-semibold hover:text-neon">
                    {r.match.tournament.name}
                  </Link>
                  <span className="text-xs text-muted">
                    {r.match.tournament.game?.name} · ronda {r.match.round} · reportado por @{r.reporter.username} · {formatDateTime(r.createdAt)}
                  </span>
                </p>
                <p>
                  {r.match.participants
                    .map((p) => `${p.registration.player?.nickname ?? p.registration.team?.name ?? '—'} ${p.score ?? '-'}${p.isWinner ? ' (G)' : ''}`)
                    .join('  vs  ')}
                </p>
                <ul className="text-xs text-muted">
                  {r.match.results.map((res) => (
                    <li key={res.version}>
                      v{res.version} · {res.status} · {Object.values(res.scores).join('-')} · confirmado por @{res.confirmedBy.username} · {formatDateTime(res.createdAt)}
                      {res.correctionReason && ` · motivo: ${res.correctionReason}`}
                    </li>
                  ))}
                </ul>
                <p className="rounded-lg bg-surface-2 p-2">“{r.reason}”</p>
                {r.status === 'OPEN' ? (
                  <ActionForm
                    action={reviewReportAction}
                    buttons={[
                      { label: `Procede (revierte ${r.match._count.rankingEvents} eventos)`, name: 'decision', value: 'UPHELD', danger: true },
                      { label: 'Desestimar', name: 'decision', value: 'DISMISSED' },
                    ]}
                  >
                    <input type="hidden" name="id" value={r.id} />
                    <Reason name="resolution" placeholder="Resolución (se envía al reportante)" />
                  </ActionForm>
                ) : (
                  r.resolution && <p className="text-xs">Resolución: {r.resolution}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No hay reportes con este estado.</p>
        )}
        <Pagination page={reports.page} totalPages={reports.totalPages} hrefFor={(n) => `/admin/rankings/revision${qs({ ...base, page: n })}`} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Patrones anómalos en {game.name}</h2>
        <p className="text-xs text-muted">Señales para revisar, no sanciones automáticas.</p>
        {anomalies.repeatedPairings.length + anomalies.organizerConcentration.length === 0 ? (
          <p className="text-sm text-muted">Sin patrones anómalos detectados.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {anomalies.repeatedPairings.map((a, i) => (
              <li key={`p${i}`} className="card flex items-start gap-2 border-amber/40 p-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden />
                <span>
                  <b>{a.participants.map((p) => p.name).join(' vs ')}</b>: {a.matches} enfrentamientos en {a.tournaments} torneos (90 días) y siempre
                  ganó {a.winner.name}.
                </span>
              </li>
            ))}
            {anomalies.organizerConcentration.map((a, i) => (
              <li key={`c${i}`} className="card flex items-start gap-2 border-amber/40 p-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber" aria-hidden />
                <span>
                  <b>{a.participant.name}</b>: el {a.share}% de sus {a.points} puntos ({a.tournaments} torneos) viene de partidas de {a.organizer}.
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3 p-4">
          <h2 className="text-lg font-bold">Ajuste de puntos</h2>
          <p className="text-xs text-muted">Crea un evento auditado (positivo o negativo); no modifica los resultados.</p>
          <ActionForm action={adjustmentAction} buttons={[{ label: 'Aplicar ajuste' }]} className="grid gap-2">
            <input type="hidden" name="gameId" value={game.id} />
            <ParticipantSelect options={participantOptions} />
            <input type="number" name="points" required min={-10000} max={10000} placeholder="Puntos (negativo para restar)" className="input" />
            <Reason />
          </ActionForm>
        </div>
        <div className="card space-y-3 p-4">
          <h2 className="text-lg font-bold">Suspensión temporal del ranking</h2>
          <p className="text-xs text-muted">Excluye al participante de las clasificaciones hasta la fecha indicada. Requiere una decisión administrativa válida.</p>
          <ActionForm
            action={suspensionAction}
            buttons={[
              { label: 'Suspender', name: 'action', value: 'SUSPEND', danger: true },
              { label: 'Levantar suspensión', name: 'action', value: 'LIFT' },
            ]}
            className="grid gap-2"
          >
            <ParticipantSelect options={participantOptions} />
            <label className="block">
              <span className="label">Hasta</span>
              <input type="date" name="until" className="input" />
            </label>
            <Reason />
          </ActionForm>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold">Eventos de puntuación</h2>
          {sp.participant && (
            <Link href={`/admin/rankings/revision${qs({ game: game.id })}`} className="chip">
              Quitar filtro de participante ✕
            </Link>
          )}
        </div>
        <ul className="divide-y divide-line rounded-xl border border-line text-sm">
          {events.items.map((e) => (
            <li key={e.id} className="space-y-1 px-3 py-2">
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={`w-14 text-right font-semibold tabular-nums ${e.isReverted ? 'text-muted line-through' : ''}`}>
                  {e.pointsAwarded > 0 ? '+' : ''}
                  {e.pointsAwarded}
                </span>
                <Link href={`/admin/rankings/revision${qs({ game: game.id, participant: e.participantId })}`} className="font-semibold hover:text-neon">
                  {e.participant?.name ?? e.participantId.slice(0, 8)}
                </Link>
                <span className="text-xs text-muted">
                  {RANKING_EVENT_LABEL[e.eventType]}
                  {e.placement ? ` ${e.placement}.º` : ''} · {e.tournament?.name ?? 'sin torneo'}
                  {e.match?.results[0] && ` · resultado v${e.match.results[0].version} confirmado por @${e.match.results[0].confirmedBy.username}`} · reglas v{e.scoringRulesVersion} ·{' '}
                  {formatDateTime(e.createdAt)}
                </span>
              </p>
              {e.isReverted ? (
                <p className="pl-16 text-xs text-muted">Revertido{e.revertedById ? ' por un administrador' : ' por recálculo'}{e.revertReason ? `: ${e.revertReason}` : ''}</p>
              ) : (
                <details className="pl-16">
                  <summary className="cursor-pointer text-xs text-muted hover:text-danger">Revertir</summary>
                  <ActionForm action={revertEventAction} buttons={[{ label: 'Revertir evento', danger: true }]} className="mt-2 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={e.id} />
                    <Reason />
                  </ActionForm>
                </details>
              )}
            </li>
          ))}
          {!events.items.length && <li className="px-3 py-4 text-muted">Sin eventos.</li>}
        </ul>
        <Pagination page={events.page} totalPages={events.totalPages} hrefFor={(n) => `/admin/rankings/revision${qs({ ...base, epage: n })}`} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Historial de modificaciones</h2>
        <ul className="divide-y divide-line rounded-xl border border-line text-sm">
          {audit.items.map((a) => (
            <li key={a.id} className="px-3 py-2">
              <p>
                <b>{a.action}</b> <span className="text-xs text-muted">· {a.entityType} · @{a.administrator.username} · {formatDateTime(a.createdAt)}</span>
              </p>
              <p className="text-xs text-muted">{a.reason}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ParticipantSelect({ options }: { options: { type: string; id: string; name: string }[] }) {
  // El valor lleva el tipo de ranking y el id: "PLAYER:uuid" o "TEAM:uuid"
  return (
    <select name="participant" required className="input" aria-label="Participante" defaultValue="">
      <option value="" disabled>
        Participante
      </option>
      {options.map((o) => (
        <option key={`${o.type}:${o.id}`} value={`${o.type}:${o.id}`}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
