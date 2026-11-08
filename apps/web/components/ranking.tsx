import Link from 'next/link';
import { ArrowDown, ArrowUp, Equal, Sparkles } from 'lucide-react';
import type { RankingParticipant, RankingType, TrendStatus } from '@/lib/types';
import { flag } from '@/lib/format';
import { Avatar } from '@/components/ui';

/** Indicador de evolución calculado por la API comparando snapshots (↑ ↓ = NEW). */
export function TrendBadge({ trend }: { trend: { status: TrendStatus; delta: number } | null }) {
  if (!trend) return <span className="text-xs text-muted">—</span>;
  const map = {
    UP: { Icon: ArrowUp, cls: 'text-lime', text: `Subió ${trend.delta}`, label: `${trend.delta}` },
    DOWN: { Icon: ArrowDown, cls: 'text-danger', text: `Bajó ${-trend.delta}`, label: `${-trend.delta}` },
    SAME: { Icon: Equal, cls: 'text-muted', text: 'Se mantuvo', label: '' },
    NEW: { Icon: Sparkles, cls: 'text-neon', text: 'Nuevo participante', label: 'NEW' },
  }[trend.status];
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${map.cls}`} title={map.text}>
      <map.Icon className="size-3.5" aria-hidden />
      <span className="sr-only">{map.text}</span>
      <span aria-hidden>{map.label}</span>
    </span>
  );
}

export function participantHref(type: RankingType, p: RankingParticipant) {
  if (type === 'PLAYER') return p.username ? `/jugadores/${p.username}` : null;
  return p.slug ? `/equipos/${p.slug}` : null;
}

export function ParticipantCell({ type, participant, size = 32 }: { type: RankingType; participant: RankingParticipant | null; size?: number }) {
  if (!participant) return <span className="text-muted">—</span>;
  const href = participantHref(type, participant);
  const body = (
    <>
      <Avatar src={participant.avatarUrl} name={participant.name} size={size} rounded={type === 'PLAYER' ? 'full' : 'xl'} />
      <span className="min-w-0">
        <span className="block truncate font-semibold">
          {participant.name} {participant.tag && <span className="text-xs text-muted">[{participant.tag}]</span>}
        </span>
        {participant.username && <span className="block truncate text-xs text-muted">@{participant.username}</span>}
      </span>
    </>
  );
  return href ? (
    <Link href={href} className="flex min-w-0 items-center gap-2 hover:text-neon">
      {body}
    </Link>
  ) : (
    <span className="flex min-w-0 items-center gap-2">{body}</span>
  );
}

export function CountryCell({ code }: { code: string | null }) {
  return code ? (
    <span title={code}>
      {flag(code)} <span className="text-xs text-muted">{code}</span>
    </span>
  ) : (
    <span className="text-muted">—</span>
  );
}
