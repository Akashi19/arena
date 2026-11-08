import type { Metadata } from 'next';
import Link from 'next/link';
import { GitCompareArrows, Users } from 'lucide-react';
import { api, qs } from '@/lib/api';
import type { CompetitiveLevel, Discipline, Paginated, PlayerCard } from '@/lib/types';
import { COUNTRIES, flag, LEVEL_LABEL, LEVEL_SOURCE_LABEL, PLATFORM_LABEL } from '@/lib/format';
import { Avatar, EmptyState, Pagination } from '@/components/ui';
import { LevelTag } from '@/components/game-profile';

export const metadata: Metadata = {
  title: 'Jugadores',
  description: 'Encuentra jugadores por videojuego, nivel, rango, rol, plataforma, disponibilidad y país.',
};

type Rank = { id: string; rankName: string; rankOrder: number };

export default async function PlayersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const games = await api<Discipline[]>('/games', { auth: false });
  const game = games.find((g) => g.id === sp.game);
  const ranks = game ? (await api<Rank[]>(`/games/${game.id}/ranks`, { auth: false }).catch(() => [])).sort((a, b) => a.rankOrder - b.rankOrder) : [];
  // El rango solo tiene sentido dentro del juego elegido
  const rank = ranks.some((r) => r.id === sp.rank) ? sp.rank : undefined;
  const query = {
    q: sp.q,
    game: game?.id,
    level: sp.level,
    rank,
    platform: sp.platform,
    country: sp.country,
    role: sp.role,
    availability: sp.availability,
    team: sp.team === 'with' || sp.team === 'without' ? sp.team : undefined,
    verification: sp.verification,
    recruitment: sp.recruitment,
    page: sp.page,
  };
  const result = await api<Paginated<PlayerCard>>('/players', { auth: false, query: { ...query, pageSize: 24 } });

  return (
    <div>
      <h1 className="section-title">Jugadores</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Busca rivales o compañeros para tu equipo. El nivel declarado por cada jugador se distingue del verificado por la plataforma o
        por una fuente externa.
      </p>
      <form className="my-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <input name="q" defaultValue={sp.q} placeholder="Apodo, usuario o gamertag" className="input sm:col-span-2" />
        <select name="game" defaultValue={game?.id ?? ''} className="input" aria-label="Videojuego">
          <option value="">Todos los juegos</option>
          {games.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <select name="level" defaultValue={sp.level ?? ''} className="input" aria-label="Nivel">
          <option value="">Cualquier nivel</option>
          {(Object.keys(LEVEL_LABEL) as CompetitiveLevel[]).map((l) => (
            <option key={l} value={l}>
              {LEVEL_LABEL[l]}
            </option>
          ))}
        </select>
        <select name="rank" defaultValue={rank ?? ''} className="input" aria-label="Rango mínimo" disabled={!ranks.length}>
          <option value="">{game ? (ranks.length ? 'Rango mínimo' : 'Sin rangos') : 'Rango (elige juego)'}</option>
          {ranks.map((r) => (
            <option key={r.id} value={r.id}>
              {r.rankName} o superior
            </option>
          ))}
        </select>
        <select name="platform" defaultValue={sp.platform ?? ''} className="input" aria-label="Plataforma">
          <option value="">Cualquier plataforma</option>
          {Object.entries(PLATFORM_LABEL)
            .filter(([k]) => k !== 'NONE')
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
        </select>
        <input name="role" defaultValue={sp.role} placeholder="Rol o posición" className="input" maxLength={40} />
        <input name="availability" defaultValue={sp.availability} placeholder="Disponibilidad (p. ej. noches)" className="input" maxLength={40} />
        <select name="country" defaultValue={sp.country ?? ''} className="input" aria-label="País">
          <option value="">Todos los países</option>
          {Object.entries(COUNTRIES).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        <select name="team" defaultValue={query.team ?? ''} className="input" aria-label="Equipo actual">
          <option value="">Con o sin equipo</option>
          <option value="without">Sin equipo</option>
          <option value="with">Con equipo</option>
        </select>
        <select name="verification" defaultValue={sp.verification ?? ''} className="input" aria-label="Origen del nivel">
          <option value="">Cualquier origen</option>
          {Object.entries(LEVEL_SOURCE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-1">
          <label className="flex items-center gap-2 whitespace-nowrap px-1 text-sm">
            <input
              type="checkbox"
              name="recruitment"
              value="LOOKING_FOR_TEAM"
              defaultChecked={sp.recruitment === 'LOOKING_FOR_TEAM'}
              className="accent-[var(--color-neon)]"
            />
            Buscan equipo
          </label>
          <button className="btn-primary ml-auto">Filtrar</button>
        </div>
      </form>

      {/* Comparador: los jugadores se eligen en las tarjetas (atributo form) y solo dentro del juego filtrado */}
      <form id="compare" action="/jugadores/comparar" className="mb-3 flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted">{result.total} jugadores</p>
        {game ? (
          <>
            <input type="hidden" name="game" value={game.id} />
            <button className="btn-ghost ml-auto px-3 py-1.5 text-xs">
              <GitCompareArrows className="size-4" /> Comparar seleccionados en {game.name}
            </button>
          </>
        ) : (
          <p className="ml-auto text-xs text-muted">Filtra por un videojuego para comparar jugadores.</p>
        )}
      </form>

      {result.items.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {result.items.map((p) => (
            <article key={p.id} className="card relative flex min-w-0 flex-col gap-3 p-4 transition hover:border-neon/50">
              <div className="flex items-center gap-3">
                <Avatar src={p.avatarUrl} name={p.nickname} size={52} rounded="full" />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-bold">
                    <Link href={`/jugadores/${p.username}`} className="after:absolute after:inset-0">
                      {p.nickname}
                    </Link>{' '}
                    <span className="text-sm">{flag(p.country)}</span>
                  </h2>
                  <p className="flex items-center gap-1 truncate text-xs text-muted">
                    @{p.username}
                    {p.currentTeam && (
                      <>
                        {' · '}
                        <Users className="size-3 shrink-0" /> <span className="truncate">{p.currentTeam.tag ?? p.currentTeam.name}</span>
                      </>
                    )}
                  </p>
                </div>
                {p.recruitmentStatus === 'LOOKING_FOR_TEAM' && <span className="chip shrink-0 border-lime/40 text-lime">Busca equipo</span>}
              </div>
              {p.gameProfiles.length > 0 ? (
                <ul className="space-y-1.5">
                  {p.gameProfiles.map((g) => (
                    <li key={g.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs">
                      <span className="min-w-0 truncate">
                        <b>{g.game.name}</b> · {g.rank?.rankName ?? PLATFORM_LABEL[g.platform]}
                        {g.playerRole && <span className="text-muted"> · {g.playerRole}</span>}
                      </span>
                      <LevelTag profile={g} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted">Sin videojuegos en su perfil.</p>
              )}
              {p.availability && <p className="truncate text-xs text-muted">Disponible: {p.availability}</p>}
              {game && p.gameProfiles.some((g) => g.game.id === game.id) && (
                <label className="relative z-10 flex w-fit items-center gap-2 text-xs">
                  <input type="checkbox" name="players" value={p.username} form="compare" className="accent-[var(--color-neon)]" />
                  Comparar
                </label>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="No encontramos jugadores">Prueba con otros filtros.</EmptyState>
      )}
      <Pagination page={result.page} totalPages={result.totalPages} hrefFor={(p) => `/jugadores${qs({ ...query, page: p })}`} />
    </div>
  );
}
