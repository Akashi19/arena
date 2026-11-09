'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { moveGameProfileAction, removeGameProfileAction, saveGameProfileAction, updatePlayerAction } from '@/app/actions';
import type { CompetitiveLevel, GameProfile, MyPlayer, Platform } from '@/lib/types';
import { LEVEL_LABEL, LEVEL_SOURCE_LABEL, PLATFORM_LABEL } from '@/lib/format';
import { FormMessage, SubmitButton, usePersistentAction } from '@/components/forms';

export interface GameOption {
  id: string;
  name: string;
  platforms: Platform[];
  ranks: { id: string; name: string }[];
}

export function PlayerSettingsForm({ player }: { player: MyPlayer }) {
  const [state, onSubmit, pending] = usePersistentAction(updatePlayerAction, {});
  return (
    <form method="post" onSubmit={onSubmit} className="card grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
      <label className="block">
        <span className="label">Estado</span>
        <select name="recruitmentStatus" defaultValue={player.recruitmentStatus === 'LOOKING_FOR_TEAM' ? 'LOOKING_FOR_TEAM' : 'NOT_LOOKING'} className="input">
          <option value="NOT_LOOKING">No busco equipo</option>
          <option value="LOOKING_FOR_TEAM">Busco equipo</option>
        </select>
      </label>
      <label className="block">
        <span className="label">Posición habitual (deportes)</span>
        <input name="position" defaultValue={player.position ?? ''} maxLength={40} placeholder="Delantero, base…" className="input" />
      </label>
      <label className="block">
        <span className="label">Dorsal</span>
        <input name="jerseyNumber" type="number" min={0} max={99} defaultValue={player.jerseyNumber ?? ''} className="input" />
      </label>
      <label className="block">
        <span className="label">Disponibilidad</span>
        <input name="availability" defaultValue={player.availability ?? ''} maxLength={200} placeholder="Noches y fines de semana" className="input" />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
        <SubmitButton pending={pending}>Guardar ficha</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function GameProfileForm({ games, profile }: { games: GameOption[]; profile?: GameProfile }) {
  const [state, onSubmit, pending] = usePersistentAction(saveGameProfileAction, {});
  const [selected, setGameId] = useState(profile?.game.id ?? games[0]?.id ?? '');
  // Tras agregar un juego, este sale de la lista: se cae al primero disponible
  const gameId = games.some((g) => g.id === selected) ? selected : (games[0]?.id ?? '');
  const game = games.find((g) => g.id === gameId);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && !profile) formRef.current?.reset();
  }, [state, profile]);

  if (!profile && !games.length) return <p className="text-sm text-muted">Ya agregaste todos los videojuegos disponibles.</p>;

  return (
    <form method="post" ref={formRef} onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      {profile ? (
        <input type="hidden" name="id" value={profile.id} />
      ) : (
        <label className="block sm:col-span-2">
          <span className="label">Videojuego</span>
          <select name="gameId" value={gameId} onChange={(e) => setGameId(e.target.value)} className="input">
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block">
        <span className="label">Gamertag / ID en el juego</span>
        <input name="gamerTag" required minLength={2} maxLength={40} defaultValue={profile?.gamerTag} className="input" />
      </label>
      <label className="block">
        <span className="label">Plataforma</span>
        <select key={gameId} name="platform" defaultValue={profile?.platform ?? game?.platforms[0]} className="input">
          {(game?.platforms ?? []).map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABEL[p]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">Nivel competitivo</span>
        <select name="competitiveLevel" defaultValue={profile?.competitiveLevel ?? 'INTERMEDIATE'} className="input">
          {(Object.keys(LEVEL_LABEL) as CompetitiveLevel[]).map((l) => (
            <option key={l} value={l}>
              {LEVEL_LABEL[l]}
            </option>
          ))}
        </select>
      </label>
      {game && game.ranks.length > 0 && (
        <label className="block">
          <span className="label">Rango</span>
          <select key={gameId} name="gameRankId" defaultValue={profile?.rank?.id ?? ''} className="input">
            <option value="">Sin rango</option>
            {game.ranks.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block">
        <span className="label">Rol (opcional)</span>
        <input name="playerRole" maxLength={40} defaultValue={profile?.playerRole ?? ''} placeholder="Duelista, soporte…" className="input" />
      </label>
      <label className="block">
        <span className="label">Años de experiencia</span>
        <input name="experienceYears" type="number" min={0} max={50} defaultValue={profile?.experienceYears ?? ''} className="input" />
      </label>
      <div className="flex flex-wrap gap-4 text-sm sm:col-span-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isPrimary" defaultChecked={profile?.isPrimary} className="accent-[var(--color-neon)]" /> Juego principal
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isFeatured" defaultChecked={profile?.isFeatured ?? true} className="accent-[var(--color-neon)]" /> Mostrar en mi
          perfil público
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isFavorite" defaultChecked={profile?.isFavorite} className="accent-[var(--color-neon)]" /> Favorito
        </label>
      </div>
      <p className="text-xs text-muted sm:col-span-2">
        {LEVEL_SOURCE_LABEL.SELF_DECLARED}: cada cambio de nivel o rango queda en tu historial. Si cambias un nivel validado
        externamente, vuelve a ser declarado; la plataforma lo respalda automáticamente cuando tus estadísticas oficiales lo justifican.
      </p>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <SubmitButton pending={pending}>{profile ? 'Guardar cambios' : 'Agregar videojuego'}</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function RemoveGameButton({ id, name }: { id: string; name: string }) {
  const [state, onSubmit, pending] = usePersistentAction(removeGameProfileAction, {});
  return (
    <form method="post"
      onSubmit={(e) => {
        if (!confirm(`¿Retirar ${name} de tu perfil? Tus estadísticas e historial se conservan.`)) {
          e.preventDefault();
          return;
        }
        onSubmit(e);
      }}
      className="flex items-center gap-3"
    >
      <input type="hidden" name="id" value={id} />
      <SubmitButton pending={pending} className="btn-danger px-3 py-1.5 text-xs" pendingText="…">
        <Trash2 className="size-3.5" /> Retirar juego
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

/** Reordena los juegos del perfil público (una posición arriba o abajo). */
export function MoveGameButtons({ id, order, index }: { id: string; order: string[]; index: number }) {
  const [state, onSubmit, pending] = usePersistentAction(moveGameProfileAction, {});
  return (
    <form method="post" onSubmit={onSubmit} className="flex items-center gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="order" value={order.join(',')} />
      <button name="direction" value="up" disabled={pending || index === 0} className="btn-ghost p-1.5 disabled:opacity-30" aria-label="Subir en el orden">
        <ArrowUp className="size-3.5" />
      </button>
      <button
        name="direction"
        value="down"
        disabled={pending || index === order.length - 1}
        className="btn-ghost p-1.5 disabled:opacity-30"
        aria-label="Bajar en el orden"
      >
        <ArrowDown className="size-3.5" />
      </button>
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}
