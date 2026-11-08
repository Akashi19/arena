import { BadgeCheck, Gamepad2 } from 'lucide-react';
import type { GameProfile } from '@/lib/types';
import { LEVEL_LABEL, LEVEL_SOURCE_LABEL, PLATFORM_LABEL } from '@/lib/format';

const LEVEL_COLOR: Record<string, string> = {
  BEGINNER: 'text-muted',
  INTERMEDIATE: 'text-lime',
  ADVANCED: 'text-neon',
  EXPERT: 'text-neon-2',
  PROFESSIONAL: 'text-amber',
};

export function LevelTag({ profile }: { profile: Pick<GameProfile, 'competitiveLevel' | 'verificationType'> }) {
  const verified = profile.verificationType !== 'SELF_DECLARED';
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${LEVEL_COLOR[profile.competitiveLevel]}`} title={LEVEL_SOURCE_LABEL[profile.verificationType]}>
      {LEVEL_LABEL[profile.competitiveLevel]}
      {verified ? <BadgeCheck className="size-3.5 text-verified" aria-label="Nivel verificado" /> : <span className="text-[10px] font-normal text-muted">(declarado)</span>}
    </span>
  );
}

/** Tarjeta de un videojuego del perfil gamer. */
export function GameProfileCard({ profile, children }: { profile: GameProfile; children?: React.ReactNode }) {
  return (
    <div className={`card p-4 ${profile.isPrimary ? 'border-neon/50' : ''}`}>
      <div className="flex items-start gap-3">
        {profile.game.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.game.logoUrl} alt="" className="size-11 shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-3 text-neon-2">
            <Gamepad2 className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-bold">
            <span className="truncate">{profile.game.name}</span>
            {profile.isPrimary && <span className="chip px-1.5 py-0 text-[10px] text-neon">Principal</span>}
          </p>
          <p className="truncate font-mono text-sm text-ink/90">{profile.gamerTag}</p>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-muted">Nivel</dt>
        <dd className="text-right">
          <LevelTag profile={profile} />
        </dd>
        {profile.rank && (
          <>
            <dt className="text-muted">Rango</dt>
            <dd className="text-right font-semibold">{profile.rank.rankName}</dd>
          </>
        )}
        <dt className="text-muted">Plataforma</dt>
        <dd className="text-right">{PLATFORM_LABEL[profile.platform]}</dd>
        {profile.playerRole && (
          <>
            <dt className="text-muted">Rol</dt>
            <dd className="truncate text-right">{profile.playerRole}</dd>
          </>
        )}
        {profile.experienceYears != null && (
          <>
            <dt className="text-muted">Experiencia</dt>
            <dd className="text-right">
              {profile.experienceYears} {profile.experienceYears === 1 ? 'año' : 'años'}
            </dd>
          </>
        )}
      </dl>
      {children}
    </div>
  );
}
