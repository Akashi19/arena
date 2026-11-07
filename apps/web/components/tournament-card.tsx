import Link from 'next/link';
import { CalendarDays, Gamepad2, MapPin, Trophy, Users, Wifi } from 'lucide-react';
import { flag, formatDateTime, formatMoney, FORMAT_LABEL, MODE_LABEL } from '@/lib/format';
import type { TournamentCard as Card } from '@/lib/types';
import { OrganizerTag, StatusBadge } from './ui';

/** Tarjeta visual de partida: organizador (logo + insignia), disciplina, fecha, cupos, cuota y estado. */
export function TournamentCard({ t }: { t: Card }) {
  const discipline = t.game ?? t.sport;
  const pct = Math.min(100, Math.round((t.registeredCount / t.maxParticipants) * 100));
  const canRegister = t.status === 'OPEN' && t.spotsLeft > 0 && new Date(t.registrationDeadline) > new Date();
  const accent = t.organizer.primaryColor ?? undefined;

  return (
    <article className="card group relative flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-neon/50 hover:shadow-neon">
      <div className="relative h-28 overflow-hidden bg-surface-3">
        {t.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.coverUrl} alt="" className="size-full object-cover opacity-70 transition group-hover:scale-105 group-hover:opacity-90" />
        ) : (
          <div
            className="size-full"
            style={{
              background: `linear-gradient(135deg, ${accent ?? '#22d3ee'}33, transparent 55%), repeating-linear-gradient(45deg, #ffffff06 0 10px, transparent 10px 20px)`,
            }}
          />
        )}
        <div className="absolute inset-x-3 top-3 flex items-center justify-between gap-2">
          <span className="chip border-white/10 bg-bg/70 text-ink backdrop-blur">
            {t.category === 'ESPORT' ? <Gamepad2 className="size-3.5 text-neon-2" /> : <Trophy className="size-3.5 text-lime" />}
            {discipline?.name}
          </span>
          <StatusBadge status={t.status} />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="relative z-10">
          <OrganizerTag organizer={t.organizer} />
        </div>
        <div>
          {t.competition && <p className="truncate text-xs font-semibold uppercase tracking-wider text-neon-2">{t.competition.name}</p>}
          <h3 className="line-clamp-2 text-lg font-bold leading-tight">
            <Link href={`/torneos/${t.slug}`} className="after:absolute after:inset-0 hover:text-neon">
              {t.name}
            </Link>
          </h3>
        </div>

        <ul className="space-y-1.5 text-sm text-muted">
          <li className="flex items-center gap-2">
            <CalendarDays className="size-4 shrink-0 text-neon" /> {formatDateTime(t.startsAt)}
          </li>
          <li className="flex items-center gap-2">
            {t.isOnline ? <Wifi className="size-4 shrink-0 text-neon" /> : <MapPin className="size-4 shrink-0 text-neon" />}
            <span className="truncate">{t.isOnline ? 'Online' : `${t.city ?? t.location ?? ''} ${flag(t.country)}`}</span>
          </li>
          <li className="flex items-center gap-2">
            <Users className="size-4 shrink-0 text-neon" /> {MODE_LABEL[t.mode]} · {FORMAT_LABEL[t.format]}
          </li>
        </ul>

        <div>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-muted">
              <b className="text-ink">{t.registeredCount}</b>/{t.maxParticipants} inscritos
            </span>
            <span className={t.spotsLeft > 0 ? 'text-lime' : 'text-danger'}>
              {t.spotsLeft > 0 ? `${t.spotsLeft} cupos` : 'Completo'}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-gradient-to-r from-neon to-neon-2" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Cuota de inscripción</p>
            <p className="font-display text-xl font-bold text-ink">{formatMoney(t.entryFee, t.currency)}</p>
          </div>
          <div className="relative z-10 flex gap-2">
            <Link href={`/torneos/${t.slug}`} className="btn-ghost px-3 py-2 text-xs">
              Detalles
            </Link>
            {canRegister && (
              <Link href={`/torneos/${t.slug}#inscripcion`} className="btn-primary px-3 py-2 text-xs">
                Inscribirme
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
