import type { Metadata } from 'next';
import Link from 'next/link';
import { api, qs } from '@/lib/api';
import type { CompetitiveLevel, Discipline, Paginated, PlayerCard } from '@/lib/types';
import { COUNTRIES, flag, LEVEL_LABEL, PLATFORM_LABEL } from '@/lib/format';
import { Avatar, EmptyState, Pagination } from '@/components/ui';
import { LevelTag } from '@/components/game-profile';

export const metadata: Metadata = {
  title: 'Jugadores',
  description: 'Encuentra jugadores por videojuego, nivel competitivo, plataforma y país.',
};

export default async function PlayersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const query = { q: sp.q, game: sp.game, level: sp.level, platform: sp.platform, country: sp.country, recruitment: sp.recruitment, page: sp.page };
  const [result, games] = await Promise.all([
    api<Paginated<PlayerCard>>('/players', { auth: false, query: { ...query, pageSize: 24 } }),
    api<Discipline[]>('/games', { auth: false }),
  ]);

  return (
    <div>
      <h1 className="section-title">Jugadores</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Busca rivales o compañeros por videojuego, nivel y país. El nivel declarado por cada jugador se distingue del
        verificado.
      </p>
      <form className="my-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <input name="q" defaultValue={sp.q} placeholder="Apodo, usuario o gamertag" className="input sm:col-span-2" />
        <select name="game" defaultValue={sp.game ?? ''} className="input" aria-label="Videojuego">
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
        <select name="country" defaultValue={sp.country ?? ''} className="input" aria-label="País">
          <option value="">Todos los países</option>
          {Object.entries(COUNTRIES).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-6">
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

      <p className="mb-3 text-sm text-muted">{result.total} jugadores</p>
      {result.items.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {result.items.map((p) => (
            <Link key={p.id} href={`/jugadores/${p.username}`} className="card flex flex-col gap-3 p-4 transition hover:border-neon/50">
              <div className="flex items-center gap-3">
                <Avatar src={p.avatarUrl} name={p.nickname} size={52} rounded="full" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold">
                    {p.nickname} <span className="text-sm">{flag(p.country)}</span>
                  </p>
                  <p className="truncate text-xs text-muted">
                    @{p.username} · {p._count.teams} {p._count.teams === 1 ? 'equipo' : 'equipos'}
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
                      </span>
                      <LevelTag profile={g} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted">Sin videojuegos en su perfil.</p>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState title="No encontramos jugadores">Prueba con otros filtros.</EmptyState>
      )}
      <Pagination page={result.page} totalPages={result.totalPages} hrefFor={(p) => `/jugadores${qs({ ...query, page: p })}`} />
    </div>
  );
}
