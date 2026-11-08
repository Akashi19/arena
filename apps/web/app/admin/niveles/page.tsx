import type { Metadata } from 'next';
import Link from 'next/link';
import { api, qs } from '@/lib/api';
import { gamesWithRanks } from '@/lib/catalog';
import type { GameProfile, LevelVerificationType, Paginated } from '@/lib/types';
import { formatDate, LEVEL_SOURCE_LABEL, PLATFORM_LABEL } from '@/lib/format';
import { Avatar, EmptyState, Pagination } from '@/components/ui';
import { LevelTag } from '@/components/game-profile';
import { LevelVerificationForm } from './level-form';

export const metadata: Metadata = { title: 'Niveles competitivos' };

type AdminProfile = GameProfile & {
  playerId: string;
  gameId: string;
  nickname: string;
  avatarUrl: string | null;
  username: string | null;
  stats: { matchesPlayed: number; winRate: number; tournamentsWon: number } | null;
};

const TYPES = Object.keys(LEVEL_SOURCE_LABEL) as LevelVerificationType[];

export default async function AdminLevelsPage({ searchParams }: { searchParams: Promise<{ q?: string; game?: string; type?: string; page?: string }> }) {
  const sp = await searchParams;
  const games = await gamesWithRanks();
  const game = games.some((g) => g.id === sp.game) ? sp.game : undefined;
  const type = TYPES.includes(sp.type as LevelVerificationType) ? sp.type : undefined;
  const data = await api<Paginated<AdminProfile>>('/admin/game-profiles', { query: { q: sp.q, game, type, page: sp.page, pageSize: 20 } });

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        El respaldo de la plataforma es automático según las estadísticas oficiales. Aquí se registra la validación con una fuente externa
        autorizada; toda decisión exige justificación y queda en el historial del jugador y en la auditoría.
      </p>
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q} placeholder="Jugador o gamertag" className="input w-56" />
        <select name="game" defaultValue={game ?? ''} className="input w-48" aria-label="Videojuego">
          <option value="">Todos los juegos</option>
          {games.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <select name="type" defaultValue={type ?? ''} className="input w-56" aria-label="Origen del nivel">
          <option value="">Cualquier origen</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {LEVEL_SOURCE_LABEL[t]}
            </option>
          ))}
        </select>
        <button className="btn-ghost">Filtrar</button>
      </form>

      {data.items.length ? (
        <ul className="space-y-3">
          {data.items.map((p) => (
            <li key={p.id} className="card space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Avatar src={p.avatarUrl} name={p.nickname} size={40} rounded="full" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {p.username ? (
                      <Link href={`/jugadores/${p.username}`} className="font-semibold hover:text-neon">
                        {p.nickname}
                      </Link>
                    ) : (
                      <b>{p.nickname}</b>
                    )}{' '}
                    <span className="text-xs text-muted">
                      · {p.game.name} · <span className="font-mono">{p.gamerTag}</span> · {PLATFORM_LABEL[p.platform]}
                    </span>
                  </p>
                  <p className="text-xs text-muted">
                    {LEVEL_SOURCE_LABEL[p.verificationType]} · {formatDate(p.verifiedAt ?? p.lastUpdatedAt)}
                    {p.verificationSource && ` · ${p.verificationSource}`}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <LevelTag profile={p} />
                  <p className="text-xs text-muted">{p.rank?.rankName ?? 'Sin rango'}</p>
                </div>
              </div>
              <p className="text-xs text-muted">
                Estadísticas oficiales:{' '}
                {p.stats ? `${p.stats.matchesPlayed} ${p.stats.matchesPlayed === 1 ? 'partida' : 'partidas'} · ${p.stats.winRate.toFixed(0)}% de victorias · ${p.stats.tournamentsWon} ${p.stats.tournamentsWon === 1 ? 'título' : 'títulos'}` : 'sin partidas oficiales'}
              </p>
              <LevelVerificationForm
                id={p.id}
                type={p.verificationType}
                level={p.competitiveLevel}
                rankId={p.rank?.id ?? null}
                ranks={games.find((g) => g.id === p.gameId)?.ranks ?? []}
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No hay perfiles con ese filtro" />
      )}
      <Pagination page={data.page} totalPages={data.totalPages} hrefFor={(n) => `/admin/niveles${qs({ q: sp.q, game, type, page: n })}`} />
    </div>
  );
}
