import type { Metadata } from 'next';
import Link from 'next/link';
import { api } from '@/lib/api';
import { CATEGORY_LABEL, formatDate, formatPercent, STATS_PERIOD_LABEL, STATUS_LABEL, VERIFICATION_LABEL } from '@/lib/format';
import type { PlatformStats, TournamentStatus } from '@/lib/types';
import { MetricChart } from '@/components/metric-chart';
import { fmtNum, formatRows, KpiDelta, PeriodPicker, ShareBars, TopParticipantsTable } from '@/components/stats';

/** Los límites del periodo son meses calendario en UTC. */
const UTC = { timeZone: 'UTC' } as const;

export const metadata: Metadata = { title: 'Estadísticas globales' };

const PERIODS = [1, 3, 6, 12];
const ROLE_LABEL: Record<string, string> = { PLAYER: 'Jugadores', ORGANIZER: 'Organizadores', SUPERADMIN: 'Administradores' };

export default async function PlatformStatsPage({ searchParams }: { searchParams: Promise<{ meses?: string }> }) {
  const sp = await searchParams;
  const months = PERIODS.includes(Number(sp.meses)) ? Number(sp.meses) : 6;
  const d = await api<PlatformStats>(`/admin/stats?months=${months}`);
  const s = d.summary;
  const c = d.changes;
  const signupsTotal = d.users.signups.reduce((a, m) => a + m.users, 0);
  const totalTournaments = Object.values(d.tournamentsByStatus).reduce((a, n) => a + (n ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted">
          {formatDate(d.range.from, UTC)} – {formatDate(d.range.to)}, comparado con el periodo anterior de igual duración.
        </p>
        <PeriodPicker current={months} options={PERIODS} hrefFor={(m) => `/admin/estadisticas?meses=${m}`} />
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Usuarios">
        <KpiDelta label="Usuarios" value={fmtNum(d.users.total)} hint={`${fmtNum(signupsTotal)} nuevos en el periodo`} />
        <KpiDelta label="Activos (30 días)" value={fmtNum(d.users.activeLast30Days)} hint={`${formatPercent(d.users.total ? d.users.activeLast30Days / d.users.total : null)} del total`} />
        <KpiDelta
          label="Organizadores"
          value={fmtNum(d.users.byRole.ORGANIZER ?? 0)}
          hint={`${fmtNum(d.organizersByVerification.VERIFIED ?? 0)} ${(d.organizersByVerification.VERIFIED ?? 0) === 1 ? 'verificado' : 'verificados'}`}
        />
        <KpiDelta label="Cuentas suspendidas" value={fmtNum(d.users.suspended)} hint={`${fmtNum(d.users.byRole.PLAYER ?? 0)} jugadores en total`} />
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Actividad del periodo">
        <KpiDelta label="Partidas del periodo" value={fmtNum(s.tournamentsStarted)} change={c.tournamentsStarted} />
        <KpiDelta label="Inscripciones" value={fmtNum(s.registrations)} change={c.registrations} />
        <KpiDelta label="Encuentros jugados" value={fmtNum(s.matchesPlayed)} change={c.matchesPlayed} />
        <KpiDelta label="Ocupación de cupos" value={formatPercent(s.occupancyRate)} change={c.occupancyRate} hint={`${fmtNum(s.capacity)} cupos ofrecidos`} />
        <KpiDelta label="Participantes activos" value={fmtNum(s.activeParticipants)} change={c.activeParticipants} />
        <KpiDelta label="Participantes nuevos" value={fmtNum(s.newParticipants)} change={c.newParticipants} />
        <KpiDelta label="Tasa de aprobación" value={formatPercent(s.approvalRate)} change={c.approvalRate} />
        <KpiDelta label="Partidas finalizadas" value={fmtNum(s.tournamentsFinished)} change={c.tournamentsFinished} hint={`${fmtNum(s.tournamentsCancelled)} canceladas`} />
      </section>

      <section className="card min-w-0 p-5" aria-labelledby="g-monthly">
        <h2 id="g-monthly" className="mb-3 text-lg font-bold uppercase">
          Evolución mensual
        </h2>
        <MetricChart
          months={d.monthly.map((m) => m.month)}
          caption={`Actividad de la plataforma · ${STATS_PERIOD_LABEL[months]}`}
          metrics={[
            { key: 'signups', label: 'Registros de usuarios', values: d.users.signups.map((m) => m.users) },
            { key: 'organizers', label: 'Nuevos organizadores', values: d.users.signups.map((m) => m.organizers) },
            { key: 'tournaments', label: 'Partidas creadas', values: d.monthly.map((m) => m.tournaments) },
            { key: 'registrations', label: 'Inscripciones', values: d.monthly.map((m) => m.registrations) },
            { key: 'matches', label: 'Encuentros jugados', values: d.monthly.map((m) => m.matches) },
          ]}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card min-w-0 p-5" aria-labelledby="g-disc">
          <h2 id="g-disc" className="mb-1 text-lg font-bold uppercase">
            Disciplinas
          </h2>
          <p className="mb-4 text-xs text-muted">
            Partidas del periodo:{' '}
            {(['ESPORT', 'SPORT'] as const).map((k, i) => (
              <span key={k}>
                {i > 0 && ' · '}
                {CATEGORY_LABEL[k]} {fmtNum(d.tournamentsByCategory[k] ?? 0)}
              </span>
            ))}
          </p>
          <ShareBars
            empty="No hay partidas en este periodo."
            rows={d.byDiscipline.map((x) => ({
              label: `${x.name} · ${CATEGORY_LABEL[x.category]}`,
              value: x.tournaments,
              detail: `${fmtNum(x.participants)} inscritos, ${formatPercent(x.occupancyRate)} ocupación`,
            }))}
          />
        </section>
        <section className="card min-w-0 p-5" aria-labelledby="g-status">
          <h2 id="g-status" className="mb-1 text-lg font-bold uppercase">
            Partidas por estado
          </h2>
          <p className="mb-4 text-xs text-muted">Todas las partidas de la plataforma ({fmtNum(totalTournaments)}).</p>
          <ShareBars
            empty="Todavía no hay partidas."
            rows={(Object.keys(STATUS_LABEL) as TournamentStatus[]).map((k) => ({
              label: STATUS_LABEL[k],
              value: d.tournamentsByStatus[k] ?? 0,
              detail: formatPercent(totalTournaments ? (d.tournamentsByStatus[k] ?? 0) / totalTournaments : null),
            }))}
          />
          <h3 className="mb-3 mt-6 text-sm font-bold uppercase">Formatos del periodo</h3>
          <ShareBars empty="No hay partidas en este periodo." rows={formatRows(d.byFormat)} />
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card min-w-0 p-5" aria-labelledby="g-org">
          <h2 id="g-org" className="mb-3 text-lg font-bold uppercase">
            Organizadores más activos
          </h2>
          {d.topOrganizers.length ? (
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <caption className="sr-only">Organizadores con más inscritos en el periodo</caption>
                <thead className="text-left text-[11px] uppercase tracking-wider text-muted">
                  <tr>
                    <th scope="col" className="py-2 font-semibold">Organizador</th>
                    <th scope="col" className="py-2 text-right font-semibold">Partidas</th>
                    <th scope="col" className="py-2 text-right font-semibold">Inscritos</th>
                    <th scope="col" className="py-2 text-right font-semibold">Encuentros</th>
                  </tr>
                </thead>
                <tbody>
                  {d.topOrganizers.map((o) => (
                    <tr key={o.id} className="border-t border-line">
                      <td className="py-2 pr-3">
                        <Link href={`/organizer/${o.username}`} className="font-semibold hover:text-neon">
                          {o.displayName}
                        </Link>
                      </td>
                      <td className="py-2 text-right tabular-nums">{o.tournaments}</td>
                      <td className="py-2 text-right font-semibold tabular-nums">{fmtNum(o.participants)}</td>
                      <td className="py-2 text-right tabular-nums">{fmtNum(o.matchesPlayed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted">No hay partidas en este periodo.</p>
          )}
        </section>
        <section className="card min-w-0 p-5" aria-labelledby="g-top">
          <h2 id="g-top" className="mb-3 text-lg font-bold uppercase">
            Más victorias en la plataforma
          </h2>
          <TopParticipantsTable rows={d.top} />
        </section>
      </div>

      <section className="card p-5" aria-labelledby="g-ver">
        <h2 id="g-ver" className="mb-3 text-lg font-bold uppercase">
          Verificación de organizadores
        </h2>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
          {Object.entries(d.organizersByVerification)
            .sort((a, b) => b[1] - a[1])
            .map(([k, n]) => (
              <div key={k}>
                <dt className="text-xs text-muted">{VERIFICATION_LABEL[k as keyof typeof VERIFICATION_LABEL] ?? k}</dt>
                <dd className="font-display text-2xl font-bold tabular-nums">{fmtNum(n)}</dd>
              </div>
            ))}
        </dl>
        <p className="mt-3 text-xs text-muted">
          Usuarios por rol:{' '}
          {Object.entries(d.users.byRole)
            .map(([k, n]) => `${ROLE_LABEL[k] ?? k} ${fmtNum(n)}`)
            .join(' · ')}
          . Ingresos y suscripciones en{' '}
          <Link href="/admin/suscripciones" className="font-semibold text-neon hover:underline">
            Suscripciones
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
