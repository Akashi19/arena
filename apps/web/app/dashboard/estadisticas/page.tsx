import type { Metadata } from 'next';
import Link from 'next/link';
import { Download, FileBarChart, Lock } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { requireOrganizer } from '@/lib/session';
import { CATEGORY_LABEL, formatDate, formatPercent, STATS_PERIOD_LABEL } from '@/lib/format';
import type { OrganizerStats } from '@/lib/types';
import { MetricChart } from '@/components/metric-chart';
import { fmtNum, formatRows, KpiDelta, monthlyMetrics, PeriodPicker, ShareBars, TopParticipantsTable, TournamentPerformanceTable } from '@/components/stats';

/** Los límites del periodo son meses calendario en UTC. */
const UTC = { timeZone: 'UTC' } as const;

export const metadata: Metadata = { title: 'Estadísticas' };

const PERIODS = [1, 3, 6, 12];
const EXPORTS = [
  { kind: 'tournaments', label: 'Partidas' },
  { kind: 'registrations', label: 'Inscripciones' },
  { kind: 'matches', label: 'Encuentros' },
];

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ meses?: string; error?: string }> }) {
  await requireOrganizer('/dashboard/estadisticas');
  const sp = await searchParams;
  const months = PERIODS.includes(Number(sp.meses)) ? Number(sp.meses) : 6;

  let d: OrganizerStats;
  try {
    d = await api<OrganizerStats>(`/me/dashboard/stats?months=${months}`);
  } catch (e) {
    if (e instanceof ApiError && e.isPlanLimit) return <Locked message={e.message} />;
    throw e;
  }
  const s = d.summary;
  const c = d.changes;
  const chart = monthlyMetrics(d.monthly);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="section-title">Estadísticas</h1>
          <p className="text-sm text-muted">
            {formatDate(d.range.from, UTC)} – {formatDate(d.range.to)} · comparado con {formatDate(d.range.previousFrom, UTC)} –{' '}
            {formatDate(new Date(new Date(d.range.previousTo).getTime() - 1).toISOString(), UTC)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {d.features.executiveReport ? (
            <Link href={`/dashboard/estadisticas/reporte?meses=${months}`} className="btn-ghost px-3 py-2 text-sm">
              <FileBarChart className="size-4" /> Reporte ejecutivo
            </Link>
          ) : (
            <Link href="/dashboard/suscripcion#cambiar" className="btn-ghost px-3 py-2 text-sm text-muted" title="Incluido en el plan Business">
              <Lock className="size-4" /> Reporte ejecutivo
            </Link>
          )}
        </div>
      </div>

      <PeriodPicker current={months} options={PERIODS} hrefFor={(m) => `/dashboard/estadisticas?meses=${m}`} />

      {sp.error && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {sp.error}
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Indicadores del periodo">
        <KpiDelta label="Inscripciones" value={fmtNum(s.registrations)} change={c.registrations} />
        <KpiDelta label="Tasa de aprobación" value={formatPercent(s.approvalRate)} change={c.approvalRate} hint="Aprobadas sobre resueltas" />
        <KpiDelta label="Ocupación de cupos" value={formatPercent(s.occupancyRate)} change={c.occupancyRate} hint={`${fmtNum(s.capacity)} cupos ofrecidos`} />
        <KpiDelta label="Encuentros jugados" value={fmtNum(s.matchesPlayed)} change={c.matchesPlayed} />
        <KpiDelta label="Participantes activos" value={fmtNum(s.activeParticipants)} change={c.activeParticipants} hint="Equipos y jugadores aprobados" />
        <KpiDelta label="Participantes nuevos" value={fmtNum(s.newParticipants)} change={c.newParticipants} />
        <KpiDelta label="Recurrentes" value={formatPercent(s.retentionRate)} change={c.retentionRate} hint={`${fmtNum(s.returningParticipants)} jugaron más de una de tus partidas`} />
        <KpiDelta label="Partidas finalizadas" value={fmtNum(s.tournamentsFinished)} change={c.tournamentsFinished} hint={`${fmtNum(s.tournamentsCancelled)} canceladas`} />
      </section>

      <section className="card min-w-0 p-5" aria-labelledby="monthly-title">
        <h2 id="monthly-title" className="mb-3 text-lg font-bold uppercase">
          Evolución mensual
        </h2>
        <MetricChart months={chart.months} metrics={chart.metrics} caption={`Actividad mensual · ${STATS_PERIOD_LABEL[months]}`} />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card min-w-0 p-5" aria-labelledby="discipline-title">
          <h2 id="discipline-title" className="mb-1 text-lg font-bold uppercase">
            Inscritos por disciplina
          </h2>
          <p className="mb-4 text-xs text-muted">Inscripciones aprobadas en partidas que empiezan en el periodo, con su ocupación.</p>
          <ShareBars
            empty="No hay partidas que empiecen en este periodo."
            rows={d.byDiscipline.map((x) => ({
              label: `${x.name} · ${CATEGORY_LABEL[x.category]}`,
              value: x.participants,
              detail: `${x.tournaments} ${x.tournaments === 1 ? 'partida' : 'partidas'}, ${formatPercent(x.occupancyRate)} ocupación`,
            }))}
          />
        </section>
        <section className="card min-w-0 p-5" aria-labelledby="format-title">
          <h2 id="format-title" className="mb-1 text-lg font-bold uppercase">
            Formatos usados
          </h2>
          <p className="mb-4 text-xs text-muted">Partidas por sistema de competición y modalidad.</p>
          <ShareBars empty="No hay partidas que empiecen en este periodo." rows={formatRows(d.byFormat)} />
          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
            <div>
              <dt className="text-xs text-muted">Inscripciones pendientes</dt>
              <dd className="font-semibold tabular-nums">{fmtNum(s.registrationsPending)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Rechazadas · retiradas</dt>
              <dd className="font-semibold tabular-nums">
                {fmtNum(s.registrationsRejected)} · {fmtNum(s.registrationsWithdrawn)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Empates</dt>
              <dd className="font-semibold tabular-nums">{formatPercent(s.drawRate)} de los encuentros</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Partidas creadas</dt>
              <dd className="font-semibold tabular-nums">{fmtNum(s.tournamentsCreated)}</dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="card min-w-0 p-5" aria-labelledby="top-title">
        <h2 id="top-title" className="mb-3 text-lg font-bold uppercase">
          Más victorias en tus partidas
        </h2>
        <TopParticipantsTable rows={d.top} />
      </section>

      <section className="card min-w-0 p-5" aria-labelledby="perf-title">
        <h2 id="perf-title" className="mb-3 text-lg font-bold uppercase">
          Rendimiento por partida
        </h2>
        <TournamentPerformanceTable rows={d.tournaments} />
      </section>

      <section className="card p-5" aria-labelledby="export-title">
        <h2 id="export-title" className="mb-1 text-lg font-bold uppercase">
          Exportar
        </h2>
        {d.features.export ? (
          <>
            <p className="mb-3 text-sm text-muted">Archivos CSV del periodo seleccionado, listos para Excel o Google Sheets. Las fechas están en UTC.</p>
            <div className="flex flex-wrap gap-2">
              {EXPORTS.map((x) => (
                <a key={x.kind} href={`/dashboard/estadisticas/exportar/${x.kind}?meses=${months}`} className="btn-ghost px-3 py-2 text-sm" download>
                  <Download className="size-4" /> {x.label}
                </a>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">
            La exportación de reportes no está incluida en tu plan.{' '}
            <Link href="/dashboard/suscripcion#cambiar" className="font-semibold text-neon hover:underline">
              Ver planes
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}

function Locked({ message }: { message: string }) {
  return (
    <div className="space-y-6">
      <h1 className="section-title">Estadísticas</h1>
      <div className="card grid gap-4 p-6 md:grid-cols-[auto_1fr] md:items-start">
        <Lock className="size-8 text-neon" aria-hidden />
        <div className="space-y-3">
          <p className="font-semibold">{message}</p>
          <p className="text-sm text-muted">Con Pro o Business tendrás:</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Comparación con el periodo anterior de inscripciones, aprobación, ocupación de cupos y encuentros jugados.</li>
            <li>Participantes nuevos y recurrentes, disciplinas y formatos con más actividad.</li>
            <li>Ranking de victorias y títulos en tus partidas y el avance de cada fixture.</li>
            <li>Exportación a CSV (Pro y Business) y reporte ejecutivo imprimible (Business).</li>
          </ul>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link href="/dashboard/suscripcion#cambiar" className="btn-primary">
              Ver planes
            </Link>
            <Link href="/dashboard" className="btn-ghost">
              Volver al resumen
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
