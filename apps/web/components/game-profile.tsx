import { BadgeCheck, Gamepad2, Heart, ShieldCheck } from 'lucide-react';
import type { GameProfile, LevelVerificationType } from '@/lib/types';
import { formatDate, LEVEL_LABEL, LEVEL_SOURCE_LABEL, PLATFORM_LABEL } from '@/lib/format';

const LEVEL_COLOR: Record<string, string> = {
  BEGINNER: 'text-muted',
  INTERMEDIATE: 'text-lime',
  ADVANCED: 'text-neon',
  EXPERT: 'text-neon-2',
  PROFESSIONAL: 'text-amber',
};

const LEVEL_STEP: Record<string, number> = { BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3, EXPERT: 4, PROFESSIONAL: 5 };

/** Icono de origen: los niveles declarados nunca se muestran como certificados. */
export function SourceIcon({ type, className = 'size-3.5' }: { type: LevelVerificationType; className?: string }) {
  if (type === 'EXTERNAL_VERIFIED') return <ShieldCheck className={`${className} text-verified`} aria-label={LEVEL_SOURCE_LABEL[type]} />;
  if (type === 'PLATFORM_VERIFIED') return <BadgeCheck className={`${className} text-verified`} aria-label={LEVEL_SOURCE_LABEL[type]} />;
  return null;
}

export function LevelTag({ profile }: { profile: Pick<GameProfile, 'competitiveLevel' | 'verificationType'> }) {
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${LEVEL_COLOR[profile.competitiveLevel]}`} title={LEVEL_SOURCE_LABEL[profile.verificationType]}>
      {LEVEL_LABEL[profile.competitiveLevel]}
      {profile.verificationType === 'SELF_DECLARED' ? (
        <span className="text-[10px] font-normal text-muted">(declarado)</span>
      ) : (
        <SourceIcon type={profile.verificationType} />
      )}
    </span>
  );
}

/** Barra de 5 pasos del nivel general. */
export function LevelBar({ level }: { level: GameProfile['competitiveLevel'] }) {
  const step = LEVEL_STEP[level];
  return (
    <span className="flex gap-0.5" role="img" aria-label={`Nivel ${step} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? 'bg-current' : 'bg-surface-3'}`} />
      ))}
    </span>
  );
}

/** Tarjeta de un videojuego del perfil gamer. */
export function GameProfileCard({ profile, children }: { profile: GameProfile; children?: React.ReactNode }) {
  const verifiedDate = profile.verifiedAt ?? profile.lastUpdatedAt;
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
            {profile.isFavorite && <Heart className="size-3.5 shrink-0 text-danger" fill="currentColor" aria-label="Juego favorito" />}
          </p>
          <p className="truncate font-mono text-sm text-ink/90">{profile.gamerTag}</p>
        </div>
      </div>
      <div className={`mt-3 ${LEVEL_COLOR[profile.competitiveLevel]}`}>
        <LevelBar level={profile.competitiveLevel} />
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
      <p className="mt-3 border-t border-line pt-2 text-[11px] leading-snug text-muted">
        <span className="font-semibold text-ink/80">{LEVEL_SOURCE_LABEL[profile.verificationType]}</span> · {formatDate(verifiedDate)}
        {profile.verificationSource && <span className="block">{profile.verificationSource}</span>}
        {profile.verificationType === 'PLATFORM_VERIFIED' && profile.rank && <span className="block">El rango del juego es declarado.</span>}
      </p>
      {children}
    </div>
  );
}
