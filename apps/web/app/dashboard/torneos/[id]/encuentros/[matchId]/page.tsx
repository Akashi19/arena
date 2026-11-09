import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink, History } from 'lucide-react';
import { api, apiOrNull } from '@/lib/api';
import { requireOrganizer } from '@/lib/session';
import type { MatchStreamDetail, StreamHistoryEntry } from '@/lib/types';
import { formatDateTime, STREAM_STATUS_LABEL } from '@/lib/format';
import { entrantName } from '@/lib/fixture';
import { TournamentLive } from '@/components/realtime';
import { StreamBadge } from '@/components/stream';
import { StreamManager } from './stream-manager';

export const metadata: Metadata = { title: 'Transmisión del encuentro' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ManageMatchStreamPage({ params }: { params: Promise<{ id: string; matchId: string }> }) {
  const { id, matchId } = await params;
  await requireOrganizer(`/dashboard/torneos/${id}/encuentros/${matchId}`);
  if (!UUID.test(matchId)) notFound();
  const detail = await apiOrNull<MatchStreamDetail>(`/matches/${matchId}/stream`);
  if (!detail || !detail.canManage || detail.tournament.id !== id) notFound();
  const history = await api<StreamHistoryEntry[]>(`/matches/${matchId}/stream/history`);
  const [home, away] = [1, 2].map((s) => detail.match.participants.find((p) => p.slot === s));
  const t = detail.tournament;
  const closed = t.status === 'CANCELLED' || detail.match.status === 'CANCELLED';

  return (
    <div className="space-y-5">
      <TournamentLive tournamentId={t.id} />
      <div>
        <p className="text-sm text-muted">
          <Link href={`/dashboard/torneos/${t.id}?tab=fixture`} className="hover:text-ink">
            {t.name}
          </Link>{' '}
          / Transmisión
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="section-title">
            {entrantName(home?.registration)} vs {entrantName(away?.registration)}
          </h1>
          {detail.streamStatus !== 'NOT_CONFIGURED' && <StreamBadge status={detail.streamStatus} />}
          <Link href={`/encuentros/${matchId}`} className="btn-ghost ml-auto px-3 py-1.5 text-xs">
            <ExternalLink className="size-3.5" /> Ver página pública
          </Link>
        </div>
        <p className="mt-1 text-sm text-muted">
          {detail.match.scheduledAt ? `Encuentro programado para el ${formatDateTime(detail.match.scheduledAt)}` : 'El encuentro aún no tiene horario'}. Solo se
          aceptan enlaces HTTPS de YouTube, Twitch, Facebook, TikTok, Kick y otras plataformas autorizadas; la plataforma se detecta por el dominio.
        </p>
      </div>

      {closed ? (
        <p className="card p-4 text-sm text-muted">El encuentro o la partida están cancelados: no se pueden agregar transmisiones.</p>
      ) : (
        <StreamManager tournamentId={t.id} matchId={matchId} stream={detail.stream} rebroadcasts={detail.rebroadcasts} matchScheduledAt={detail.match.scheduledAt} />
      )}

      <section className="card p-5" aria-labelledby="history-title">
        <h2 id="history-title" className="mb-3 flex items-center gap-2 text-lg font-bold uppercase">
          <History className="size-5 text-neon" aria-hidden /> Historial de cambios
        </h2>
        {history.length ? (
          <ol className="divide-y divide-line text-sm">
            {history.map((h) => (
              <li key={h.id} className="grid gap-1 py-2.5 md:grid-cols-[160px_1fr_auto] md:items-start md:gap-4">
                <span className="text-xs text-muted">{formatDateTime(h.createdAt)}</span>
                <div className="min-w-0 space-y-0.5">
                  <p>
                    {h.modificationReason ?? 'Cambio de estado'}
                    {h.stream.isRebroadcast && <span className="chip ml-2 text-[10px]">Retransmisión</span>}
                  </p>
                  {h.previousStatus !== h.newStatus && (
                    <p className="text-xs text-muted">
                      Estado: {h.previousStatus ? STREAM_STATUS_LABEL[h.previousStatus] : '—'} → {h.newStatus ? STREAM_STATUS_LABEL[h.newStatus] : '—'}
                    </p>
                  )}
                  {h.previousUrl !== h.newUrl && (
                    <p className="break-all text-xs text-muted">
                      Enlace: {h.previousUrl ?? '—'} → {h.newUrl ?? 'eliminado'}
                    </p>
                  )}
                </div>
                <span className="text-xs text-muted">@{h.modifiedBy.username}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted">Todavía no hay cambios registrados.</p>
        )}
      </section>
    </div>
  );
}
