import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';
import { requireMe } from '@/lib/session';
import type { CompetitiveProfile, MyPlayer, ResultReport, Team } from '@/lib/types';
import { formatDate, REPORT_STATUS_LABEL } from '@/lib/format';
import { CompetitiveRanking } from '@/components/competitive-ranking';

export const metadata: Metadata = { title: 'Mi ranking competitivo' };

type MyReport = ResultReport & { match: { id: string; round: number; tournament: { name: string; slug: string } } };

export default async function MyRankingPage() {
  const me = await requireMe('/dashboard/ranking');
  const [player, teams, reports] = await Promise.all([api<MyPlayer>('/me/player'), api<Team[]>('/me/teams'), api<MyReport[]>('/rankings/reports/mine')]);
  const profile = await api<CompetitiveProfile>(`/rankings/players/${player.id}`, { auth: false });
  const owned = teams.filter((t) => t.ownerId === me.id);
  const teamProfiles = await Promise.all(owned.map((t) => api<CompetitiveProfile>(`/rankings/teams/${t.id}`, { auth: false })));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="section-title">Mi ranking competitivo</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Tu posición en cada videojuego: global, en tu país y en la temporada actual. Si un resultado oficial está mal, puedes reportarlo
          desde tus últimos movimientos durante los 30 días siguientes al cierre del torneo.{' '}
          <Link href="/rankings" className="text-neon">
            Ver rankings
          </Link>
        </p>
      </div>

      <CompetitiveRanking type="PLAYER" participantId={player.id} profile={profile} reportable title="Ranking individual" />

      {owned.map((t, i) =>
        teamProfiles[i].games.length ? <CompetitiveRanking key={t.id} type="TEAM" participantId={t.id} profile={teamProfiles[i]} reportable title={`Equipo ${t.name}`} /> : null,
      )}

      {reports.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 text-lg font-bold">Mis reportes de resultados</h2>
          <ul className="divide-y divide-line text-sm">
            {reports.map((r) => (
              <li key={r.id} className="py-2">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="chip">{REPORT_STATUS_LABEL[r.status]}</span>
                  <Link href={`/torneos/${r.match.tournament.slug}`} className="font-semibold hover:text-neon">
                    {r.match.tournament.name}
                  </Link>
                  <span className="text-xs text-muted">
                    Ronda {r.match.round} · {formatDate(r.createdAt)}
                  </span>
                </p>
                <p className="mt-1 text-muted">{r.reason}</p>
                {r.resolution && <p className="mt-1 text-xs">Resolución: {r.resolution}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
