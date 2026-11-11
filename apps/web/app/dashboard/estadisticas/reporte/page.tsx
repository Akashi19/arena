import type { Metadata } from 'next';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { requireOrganizer } from '@/lib/session';
import { CATEGORY_LABEL, formatChange, formatDate, formatDateTime, formatPercent, REPUTATION_LABEL, STATS_PERIOD_LABEL, VERIFICATION_LABEL } from '@/lib/format';
import type { ExecutiveReport, StatsSummary } from '@/lib/types';
import { Avatar } from '@/components/ui';
import { fmtNum, PeriodPicker, TopParticipantsTable, TournamentPerformanceTable } from '@/components/stats';
import { PrintButton } from '../../suscripcion/comprobantes/[id]/print-button';

/** Los límites del periodo son meses calendario en UTC. */
const UTC = { timeZone: 'UTC' } as const;

export const metadata: Metadata = { title: 'Reporte ejecutivo' };

const PERIODS = [1, 3, 6, 12];
const MONTH_LONG = new Intl.DateTimeFormat('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' });

type Row = { key: keyof StatsSummary; label: string; percent?: boolean };
const ROWS: Row[] = [
  { key: 'tournamentsStarted', label: 'Partidas del periodo' },
  { key: 'tournamentsFinished', label: 'Partidas finalizadas' },
  { key: 'registrations', label: 'Inscripciones recibidas' },
  { key: 'registrationsApproved', label: 'Inscripciones aprobadas' },
  { key: 'approvalRate', label: 'Tasa de aprobación', percent: true },
  { key: 'occupancyRate', label: 'Ocupación de cupos', percent: true },
  { key: 'matchesPlayed', label: 'Encuentros jugados' },
  { key: 'activeParticipants', label: 'Participantes activos' },
  { key: 'newParticipants', label: 'Participantes nuevos' },
  { key: 'retentionRate', label: 'Participantes recurrentes', percent: true },
];

const value = (s: StatsSummary, r: Row) => (r.percent ? formatPercent(s[r.key] as number | null) : fmtNum(s[r.key] as number));

/** Frases automáticas con los cambios más relevantes (solo con base comparable). */
function highlights(r: ExecutiveReport) {
  const out: string[] = [];
  const s = r.summary;
  const say = (label: string, k: keyof StatsSummary) => {
    const ch = r.changes[k];
    if (ch === null || Math.abs(ch) < 0.05) return;
    out.push(`${label} ${ch > 0 ? 'crecieron' : 'bajaron'} ${formatChange(Math.abs(ch))!.replace('+', '')} respecto al periodo anterior.`);
  };
  say('Las inscripciones', 'registrations');
  say('Los encuentros jugados', 'matchesPlayed');
  say('Los participantes activos', 'activeParticipants');
  if (s.occupancyRate !== null) out.push(`Se ocupó el ${formatPercent(s.occupancyRate)} de los ${fmtNum(s.capacity)} cupos ofrecidos.`);
  if (s.activeParticipants) out.push(`${fmtNum(s.returningParticipants)} de ${fmtNum(s.activeParticipants)} participantes jugaron más de una de tus partidas.`);
  const best = r.byDiscipline[0];
  if (best) out.push(`${best.name} fue la disciplina con más actividad: ${best.tournaments} ${best.tournaments === 1 ? 'partida' : 'partidas'} y ${fmtNum(best.participants)} inscritos.`);
  if (!out.length) out.push('No hubo actividad suficiente en el periodo para destacar cambios.');
  return out;
}

export default async function ExecutiveReportPage({ searchParams }: { searchParams: Promise<{ meses?: string }> }) {
  await requireOrganizer('/dashboard/estadisticas/reporte');
  const sp = await searchParams;
  const months = PERIODS.includes(Number(sp.meses)) ? Number(sp.meses) : 3;

  let r: ExecutiveReport;
  try {
    r = await api<ExecutiveReport>(`/me/dashboard/report?months=${months}`);
  } catch (e) {
    if (e instanceof ApiError && e.isPlanLimit) {
      return (
        <div className="space-y-4">
          <h1 className="section-title">Reporte ejecutivo</h1>
          <div className="card space-y-3 p-6">
            <p className="font-semibold">{e.message}</p>
            <p className="text-sm text-muted">
              El reporte ejecutivo resume el periodo frente al anterior en un documento imprimible para tu equipo o patrocinadores.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/dashboard/suscripcion#cambiar" className="btn-primary">
                Ver planes
              </Link>
              <Link href="/dashboard/estadisticas" className="btn-ghost">
                Volver a estadísticas
              </Link>
            </div>
          </div>
        </div>
      );
    }
    throw e;
  }
  const lastPrev = new Date(new Date(r.range.previousTo).getTime() - 1).toISOString();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-muted">
          <Link href={`/dashboard/estadisticas?meses=${months}`} className="hover:text-ink">
            Estadísticas
          </Link>{' '}
          / Reporte ejecutivo
        </p>
        <PrintButton />
      </div>
      <div className="print:hidden">
        <PeriodPicker current={months} options={PERIODS} hrefFor={(m) => `/dashboard/estadisticas/reporte?meses=${m}`} />
      </div>

      <article className="card min-w-0 space-y-8 p-6 md:p-8 print:border-0 print:bg-white print:p-0 print:text-black print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
          <div className="flex items-center gap-3">
            <Avatar src={r.organizer.logoUrl} name={r.organizer.displayName} size={56} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted print:text-black/60">Reporte ejecutivo</p>
              <h1 className="text-2xl font-bold">{r.organizer.displayName}</h1>
              <p className="text-sm text-muted print:text-black/60">
                Plan {r.plan} · {VERIFICATION_LABEL[r.organizer.verificationStatus]}
              </p>
            </div>
          </div>
          <div className="text-sm sm:text-right">
            <p className="font-semibold">{STATS_PERIOD_LABEL[months]}</p>
            <p className="text-muted print:text-black/60">
              {formatDate(r.range.from, UTC)} – {formatDate(r.range.to)}
            </p>
            <p className="text-xs text-muted print:text-black/60">Generado el {formatDateTime(r.generatedAt)}</p>
          </div>
        </header>

        <section aria-labelledby="hl-title">
          <h2 id="hl-title" className="mb-2 text-lg font-bold uppercase">
            Resumen
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {highlights(r).map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="kpi-title">
          <h2 id="kpi-title" className="mb-2 text-lg font-bold uppercase">
            Indicadores
          </h2>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <caption className="sr-only">Indicadores del periodo frente al periodo anterior</caption>
              <thead className="text-left text-[11px] uppercase tracking-wider text-muted print:text-black/60">
                <tr>
                  <th scope="col" className="py-2 font-semibold">Indicador</th>
                  <th scope="col" className="py-2 text-right font-semibold">Periodo actual</th>
                  <th scope="col" className="py-2 text-right font-semibold">
                    Anterior
                    <span className="block font-normal normal-case tracking-normal">
                      {formatDate(r.range.previousFrom, UTC)} – {formatDate(lastPrev, UTC)}
                    </span>
                  </th>
                  <th scope="col" className="py-2 text-right font-semibold">Variación</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.key} className="border-t border-line">
                    <th scope="row" className="py-2 pr-3 text-left font-normal">
                      {row.label}
                    </th>
                    <td className="py-2 text-right font-semibold tabular-nums">{value(r.summary, row)}</td>
                    <td className="py-2 text-right tabular-nums text-muted print:text-black/60">{value(r.previous, row)}</td>
                    <td className="py-2 text-right tabular-nums">{formatChange(r.changes[row.key]) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="month-title">
          <h2 id="month-title" className="mb-2 text-lg font-bold uppercase">
            Por mes
          </h2>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <caption className="sr-only">Actividad por mes</caption>
              <thead className="text-left text-[11px] uppercase tracking-wider text-muted print:text-black/60">
                <tr>
                  <th scope="col" className="py-2 font-semibold">Mes</th>
                  <th scope="col" className="py-2 text-right font-semibold">Partidas creadas</th>
                  <th scope="col" className="py-2 text-right font-semibold">Inscripciones</th>
                  <th scope="col" className="py-2 text-right font-semibold">Aprobadas</th>
                  <th scope="col" className="py-2 text-right font-semibold">Encuentros</th>
                </tr>
              </thead>
              <tbody>
                {r.monthly.map((m) => (
                  <tr key={m.month} className="border-t border-line">
                    <th scope="row" className="py-2 text-left font-normal">
                      {MONTH_LONG.format(new Date(`${m.month}-01T00:00:00Z`))}
                    </th>
                    <td className="py-2 text-right tabular-nums">{m.tournaments}</td>
                    <td className="py-2 text-right tabular-nums">{m.registrations}</td>
                    <td className="py-2 text-right tabular-nums">{m.approved}</td>
                    <td className="py-2 text-right tabular-nums">{m.matches}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid gap-8 lg:grid-cols-2 print:grid-cols-2">
          <section aria-labelledby="disc-title" className="min-w-0">
            <h2 id="disc-title" className="mb-2 text-lg font-bold uppercase">
              Disciplinas
            </h2>
            {r.byDiscipline.length ? (
              <ul className="divide-y divide-line text-sm">
                {r.byDiscipline.slice(0, 6).map((x) => (
                  <li key={`${x.name}-${x.category}`} className="flex justify-between gap-3 py-2">
                    <span className="min-w-0 truncate">
                      {x.name} <span className="text-xs text-muted print:text-black/60">{CATEGORY_LABEL[x.category]}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {x.tournaments} · {fmtNum(x.participants)} inscritos · {formatPercent(x.occupancyRate)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Sin partidas en el periodo.</p>
            )}
          </section>
          <section aria-labelledby="rep-title" className="min-w-0">
            <h2 id="rep-title" className="mb-2 text-lg font-bold uppercase">
              Reputación
            </h2>
            {r.reputation ? (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted print:text-black/60">Nivel</dt>
                  <dd className="font-semibold">{REPUTATION_LABEL[r.reputation.level]}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted print:text-black/60">Promedio</dt>
                  <dd className="font-semibold tabular-nums">{Number(r.reputation.averageScore).toFixed(2)} / 5</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted print:text-black/60">Valoraciones totales</dt>
                  <dd className="font-semibold tabular-nums">{fmtNum(r.reputation.totalRatings)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted print:text-black/60">Nuevas en el periodo</dt>
                  <dd className="font-semibold tabular-nums">{fmtNum(r.reputation.ratingsInPeriod)}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-muted">Sin valoraciones todavía.</p>
            )}
          </section>
        </div>

        <section aria-labelledby="top5-title">
          <h2 id="top5-title" className="mb-2 text-lg font-bold uppercase">
            Más victorias
          </h2>
          <TopParticipantsTable rows={r.top} compact />
        </section>

        <section aria-labelledby="t-title">
          <h2 id="t-title" className="mb-2 text-lg font-bold uppercase">
            Partidas del periodo
          </h2>
          <TournamentPerformanceTable rows={r.tournaments} />
        </section>

        <footer className="border-t border-line pt-4 text-xs text-muted print:text-black/60">
          Datos calculados por Arena a partir de inscripciones y resultados oficiales. Los cobros de inscripciones en línea se detallan en
          «Cobros».
        </footer>
      </article>
    </div>
  );
}
