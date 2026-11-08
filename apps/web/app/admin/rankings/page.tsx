import type { Metadata } from 'next';
import Link from 'next/link';
import { api, qs } from '@/lib/api';
import type { Discipline, Paginated, RankingSeason, RuleStatus, SeasonStatus, TournamentStatus } from '@/lib/types';
import { COUNTRIES, formatDate, formatDay, MODE_LABEL, RULE_STATUS_LABEL, SEASON_STATUS_LABEL, STATUS_LABEL } from '@/lib/format';
import { Pagination } from '@/components/ui';
import { createRuleAction, createSeasonAction, recalculateAction, tournamentRankingAction, updateRuleAction, updateSeasonAction } from '@/app/actions';
import { ActionForm } from './forms';
import { RankingAdminTabs } from './tabs';

export const metadata: Metadata = { title: 'Rankings · Configuración' };

type AdminSeason = RankingSeason & { game: { id: string; name: string }; _count: { playerRankings: number; teamRankings: number } };
type AdminRule = {
  id: string;
  gameId: string;
  competitionType: 'INDIVIDUAL' | 'TEAM';
  version: number;
  status: RuleStatus;
  minimumMatches: number;
  effectiveFrom: string;
  scoringConfiguration: Record<string, unknown>;
  game: { name: string };
};
type AdminTournament = {
  id: string;
  name: string;
  slug: string;
  status: TournamentStatus;
  mode: 'INDIVIDUAL' | 'TEAM';
  tier: number;
  isRanked: boolean;
  startsAt: string;
  game: { name: string };
  organizer: { displayName: string };
  _count: { rankingEvents: number };
};

const NEXT_STATUS: Record<SeasonStatus, SeasonStatus[]> = {
  DRAFT: ['SCHEDULED', 'ACTIVE'],
  SCHEDULED: ['DRAFT', 'ACTIVE'],
  ACTIVE: ['COMPLETED'],
  COMPLETED: ['ARCHIVED'],
  ARCHIVED: [],
};

const Reason = ({ placeholder = 'Justificación (auditoría)' }: { placeholder?: string }) => (
  <input name="reason" required minLength={5} maxLength={500} placeholder={placeholder} className="input min-w-0 flex-1 basis-56" />
);

function GameSelect({ games, value, name = 'gameId', all }: { games: Discipline[]; value?: string; name?: string; all?: string }) {
  return (
    <select name={name} defaultValue={value ?? ''} className="input w-auto" required={!all} aria-label="Videojuego">
      {all ? <option value="">{all}</option> : <option value="">Videojuego</option>}
      {games.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
    </select>
  );
}

function scoringSummary(c: Record<string, unknown>) {
  const placement = (c.placement ?? {}) as Record<string, number>;
  const tiers = (c.tierMultiplier ?? {}) as Record<string, number>;
  return [
    `V ${c.win ?? 25}`,
    `E ${c.draw ?? 10}`,
    `D ${c.loss ?? 0}`,
    `Part. ${c.participation ?? 5}`,
    Object.keys(placement).length ? `Puestos ${Object.entries(placement).map(([k, v]) => `${k}.º ${v}`).join(' / ')}` : null,
    Object.keys(tiers).length ? `Nivel ${Object.entries(tiers).map(([k, v]) => `${k}:×${v}`).join(' ')}` : null,
    c.maxPerTournament ? `Tope ${c.maxPerTournament}/torneo` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export default async function AdminRankingsPage({ searchParams }: { searchParams: Promise<{ game?: string; q?: string; page?: string }> }) {
  const sp = await searchParams;
  const games = await api<Discipline[]>('/games', { auth: false });
  const game = games.some((g) => g.id === sp.game) ? sp.game : undefined;
  const [seasons, rules, tournaments] = await Promise.all([
    api<AdminSeason[]>('/admin/ranking/seasons', { query: { game } }),
    api<AdminRule[]>('/admin/ranking/rules', { query: { game } }),
    api<Paginated<AdminTournament>>('/admin/ranking/tournaments', { query: { game, q: sp.q, page: sp.page, pageSize: 10 } }),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      <RankingAdminTabs />
      <form className="flex flex-wrap gap-2">
        <GameSelect games={games} value={game} name="game" all="Todos los videojuegos" />
        <button className="btn-ghost">Filtrar</button>
      </form>

      <section className="card space-y-3 p-4">
        <h2 className="text-lg font-bold">Recalcular rankings</h2>
        <p className="text-xs text-muted">
          Reprocesa los torneos finalizados con la versión de reglas vigente en cada fecha. Es idempotente: no duplica puntos y conserva los
          eventos anteriores como revertidos. Se registra en la auditoría.
        </p>
        <ActionForm action={recalculateAction} buttons={[{ label: 'Recalcular' }]}>
          <GameSelect games={games} value={game} all="Todos los videojuegos" />
          <Reason />
        </ActionForm>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Temporadas</h2>
        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-semibold text-neon">Nueva temporada</summary>
          <ActionForm action={createSeasonAction} buttons={[{ label: 'Crear temporada' }]} className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <input name="name" required minLength={3} maxLength={80} placeholder="Nombre (p. ej. Temporada 2027)" className="input sm:col-span-2" />
            <GameSelect games={games} value={game} />
            <select name="countryCode" className="input" aria-label="Alcance">
              <option value="">Global</option>
              {Object.entries(COUNTRIES).map(([c, n]) => (
                <option key={c} value={c}>
                  Nacional: {n}
                </option>
              ))}
            </select>
            <label className="block">
              <span className="label">Inicio</span>
              <input type="date" name="startDate" required defaultValue={today} className="input" />
            </label>
            <label className="block">
              <span className="label">Fin</span>
              <input type="date" name="endDate" required className="input" />
            </label>
            <label className="block">
              <span className="label">Mínimo de encuentros</span>
              <input type="number" name="minimumMatches" min={0} max={500} placeholder="Según la regla" className="input" />
            </label>
            <label className="block">
              <span className="label">Estado inicial</span>
              <select name="status" className="input" defaultValue="DRAFT">
                <option value="DRAFT">Borrador</option>
                <option value="SCHEDULED">Programada</option>
              </select>
            </label>
            <textarea name="description" maxLength={500} placeholder="Descripción (opcional)" className="input sm:col-span-2 lg:col-span-4" rows={2} />
          </ActionForm>
        </details>
        {seasons.length ? (
          <ul className="space-y-2">
            {seasons.map((s) => (
              <li key={s.id} className="card space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="font-semibold">{s.name}</p>
                  <span className="chip">{SEASON_STATUS_LABEL[s.status]}</span>
                  <span className="text-xs text-muted">
                    {s.game.name} · {s.countryCode ? COUNTRIES[s.countryCode] ?? s.countryCode : 'Global'} · {formatDay(s.startDate)} – {formatDay(s.endDate)} · mín.{' '}
                    {s.minimumMatches} encuentros · reglas v{s.scoringRulesVersion}
                  </span>
                  <span className="ml-auto text-xs text-muted">
                    {s._count.playerRankings} jugadores · {s._count.teamRankings} equipos
                  </span>
                </div>
                {(s.champions?.player || s.champions?.team) && (
                  <p className="text-sm">
                    Campeones: {s.champions?.player?.name ?? '—'} (individual) · {s.champions?.team?.name ?? '—'} (equipos)
                  </p>
                )}
                {NEXT_STATUS[s.status].length > 0 && (
                  <ActionForm action={updateSeasonAction} buttons={NEXT_STATUS[s.status].map((st) => ({ label: `Pasar a ${SEASON_STATUS_LABEL[st].toLowerCase()}`, name: 'status', value: st }))}>
                    <input type="hidden" name="id" value={s.id} />
                    <Reason placeholder={s.status === 'ACTIVE' ? 'Justificación (al finalizar se fijan los campeones)' : 'Justificación (auditoría)'} />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No hay temporadas con este filtro.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Reglas de puntuación</h2>
        <p className="text-xs text-muted">
          Cada versión se crea en borrador. Una versión activa no se edita (trazabilidad de los puntos ya otorgados): se crea otra y se retira
          la anterior. Activar o retirar una versión recalcula el ranking del juego.
        </p>
        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-semibold text-neon">Nueva versión de reglas</summary>
          <ActionForm action={createRuleAction} buttons={[{ label: 'Crear versión en borrador' }]} className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <GameSelect games={games} value={game} />
            <select name="competitionType" className="input" aria-label="Modalidad">
              <option value="INDIVIDUAL">Individual</option>
              <option value="TEAM">Por equipos</option>
            </select>
            <label className="block">
              <span className="label">Vigente desde</span>
              <input type="date" name="effectiveFrom" required defaultValue={today} className="input" />
            </label>
            <label className="block">
              <span className="label">Mínimo de encuentros</span>
              <input type="number" name="minimumMatches" min={0} max={500} defaultValue={5} className="input" />
            </label>
            <label className="block">
              <span className="label">Tope por torneo</span>
              <input type="number" name="maxPerTournament" min={1} max={100000} placeholder="Sin tope" className="input" />
            </label>
            <span className="hidden lg:block" />
            {(
              [
                ['win', 'Victoria', 25],
                ['draw', 'Empate', 10],
                ['loss', 'Derrota', 0],
                ['participation', 'Participación', 5],
                ['place1', '1.º puesto', 100],
                ['place2', '2.º puesto', 60],
                ['place3', '3.º puesto', 40],
                ['place4', '4.º puesto', ''],
              ] as const
            ).map(([name, label, def]) => (
              <label key={name} className="block">
                <span className="label">{label}</span>
                <input type="number" name={name} min={0} max={name.startsWith('place') ? 10000 : 1000} defaultValue={def} className="input" />
              </label>
            ))}
            {[1, 2, 3, 4, 5].map((t) => (
              <label key={t} className="block">
                <span className="label">Multiplicador nivel {t}</span>
                <input type="number" name={`tier${t}`} min={0} max={10} step={0.05} defaultValue={[1, 1.25, 1.5, 2, 3][t - 1]} className="input" />
              </label>
            ))}
            <input name="reason" required minLength={5} maxLength={500} placeholder="Justificación (auditoría)" className="input sm:col-span-3 lg:col-span-6" />
          </ActionForm>
        </details>
        <ul className="space-y-2">
          {rules.map((r) => (
            <li key={r.id} className="card space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="font-semibold">
                  {r.game.name} · {MODE_LABEL[r.competitionType]} · v{r.version}
                </p>
                <span className="chip">{RULE_STATUS_LABEL[r.status]}</span>
                <span className="text-xs text-muted">
                  desde {formatDay(r.effectiveFrom)} · mín. {r.minimumMatches} encuentros
                </span>
              </div>
              <p className="text-xs text-muted">{scoringSummary(r.scoringConfiguration)}</p>
              <ActionForm
                action={updateRuleAction}
                buttons={r.status === 'ACTIVE' ? [{ label: 'Retirar', name: 'status', value: 'RETIRED', danger: true }] : [{ label: r.status === 'DRAFT' ? 'Activar' : 'Reactivar', name: 'status', value: 'ACTIVE' }]}
              >
                <input type="hidden" name="id" value={r.id} />
                <Reason />
              </ActionForm>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Nivel de las partidas</h2>
        <p className="text-xs text-muted">
          El nivel (1 a 5) multiplica los puntos de una partida y solo lo define el SUPERADMIN: el organizador no puede alterar el ranking.
          Desmarcar “Puntúa” la excluye (sus eventos quedan revertidos, no se borran).
        </p>
        <form className="flex flex-wrap gap-2">
          {game && <input type="hidden" name="game" value={game} />}
          <input name="q" defaultValue={sp.q} placeholder="Buscar partida" className="input w-56" />
          <button className="btn-ghost">Buscar</button>
        </form>
        <ul className="space-y-2">
          {tournaments.items.map((t) => (
            <li key={t.id} className="card space-y-2 p-4">
              <p className="text-sm">
                <Link href={`/torneos/${t.slug}`} className="font-semibold hover:text-neon">
                  {t.name}
                </Link>{' '}
                <span className="text-xs text-muted">
                  · {t.game.name} · {MODE_LABEL[t.mode]} · {t.organizer.displayName} · {STATUS_LABEL[t.status]} · {formatDate(t.startsAt)} · {t._count.rankingEvents} eventos
                </span>
              </p>
              <ActionForm action={tournamentRankingAction} buttons={[{ label: 'Guardar' }]}>
                <input type="hidden" name="id" value={t.id} />
                <select name="tier" defaultValue={t.tier} className="input w-auto" aria-label="Nivel del torneo">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      Nivel {n}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 px-1 text-sm">
                  <input type="checkbox" name="isRanked" defaultChecked={t.isRanked} className="accent-[var(--color-neon)]" /> Puntúa
                </label>
                <Reason />
              </ActionForm>
            </li>
          ))}
        </ul>
        <Pagination page={tournaments.page} totalPages={tournaments.totalPages} hrefFor={(n) => `/admin/rankings${qs({ game, q: sp.q, page: n })}`} />
      </section>
    </div>
  );
}
