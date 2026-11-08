import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, BadgeCheck, ShieldQuestion } from 'lucide-react';
import { apiOrNull, qs } from '@/lib/api';
import type { OrganizerPublic, Paginated, RatingItem, ReputationSummary } from '@/lib/types';
import { formatDate, ORGANIZER_TYPE_LABEL, VERIFICATION_LABEL } from '@/lib/format';
import { Avatar, Pagination } from '@/components/ui';
import { VerifiedBadge } from '@/components/verified-badge';
import { IncidentList, RatingCard, ReputationOverview } from '@/components/trust';
import { ReportRatingButton } from './report-button';

type Props = { params: Promise<{ username: string }>; searchParams: Promise<{ page?: string; estrellas?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const data = await apiOrNull<{ organizer: OrganizerPublic }>(`/organizers/${encodeURIComponent(username)}`, { auth: false });
  return {
    title: data ? `Centro de confianza · ${data.organizer.displayName}` : 'Organizador no encontrado',
    description: 'Verificación, reputación, cumplimiento y opiniones de participantes.',
  };
}

export default async function TrustCenterPage({ params, searchParams }: Props) {
  const { username } = await params;
  const sp = await searchParams;
  const data = await apiOrNull<{ organizer: OrganizerPublic & { createdAt: string } }>(`/organizers/${encodeURIComponent(username)}`, { auth: false });
  if (!data) notFound();
  const o = data.organizer;
  const [summary, ratings] = await Promise.all([
    apiOrNull<ReputationSummary>(`/organizers/${o.id}/reputation`, { auth: false }),
    apiOrNull<Paginated<RatingItem>>(`/organizers/${o.id}/ratings`, { auth: false, query: { page: sp.page, stars: sp.estrellas, pageSize: 10 } }),
  ]);
  if (!summary || !ratings) notFound();
  const verified = o.verificationStatus === 'VERIFIED';

  return (
    <div className="space-y-6">
      <Link href={`/organizer/${username}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Perfil del organizador
      </Link>

      <header className="flex flex-wrap items-center gap-4">
        <Avatar src={o.logoUrl} name={o.displayName} size={72} accent={o.primaryColor} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold uppercase tracking-wider text-neon-2">Centro de confianza</p>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <span className="truncate">{o.displayName}</span> <VerifiedBadge organizer={o} />
          </h1>
          <p className="text-sm text-muted">
            {ORGANIZER_TYPE_LABEL[o.organizerType]} · en Arena desde {formatDate(o.createdAt)}
          </p>
        </div>
      </header>

      {/* Indicador 1: identidad verificada (independiente de la reputación) */}
      <section className={`card flex flex-wrap items-start gap-4 p-5 ${verified ? 'border-verified/50' : ''}`}>
        {verified ? <BadgeCheck className="size-8 text-verified" /> : <ShieldQuestion className="size-8 text-muted" />}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Indicador 1 · Organizador verificado</p>
          <p className={`text-xl font-bold ${verified ? 'text-verified' : ''}`}>{VERIFICATION_LABEL[o.verificationStatus]}</p>
          <p className="text-sm text-muted">
            {verified
              ? `Identidad e información pública revisadas por el equipo de Arena${o.verifiedAt ? ` el ${formatDate(o.verifiedAt)}` : ''}.`
              : 'La identidad de este organizador no está verificada actualmente.'}{' '}
            La verificación no es una garantía absoluta de cumplimiento.
          </p>
        </div>
      </section>

      {/* Indicador 2: reputación por desempeño */}
      <section className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Indicador 2 · Reputación por desempeño</p>
        <ReputationOverview summary={summary} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold uppercase">Opiniones de participantes ({ratings.total})</h2>
          <nav className="flex flex-wrap gap-1.5 text-xs">
            {[undefined, '5', '4', '3', '2', '1'].map((s) => (
              <Link
                key={s ?? 'all'}
                href={`/organizer/${username}/trust${qs({ estrellas: s })}`}
                className={`chip px-2.5 py-1 ${sp.estrellas === s ? 'border-neon text-neon' : ''}`}
              >
                {s ? `${s} ★` : 'Todas'}
              </Link>
            ))}
          </nav>
        </div>
        {ratings.items.length ? (
          <div className="space-y-3">
            {ratings.items.map((r) => (
              <RatingCard key={r.id} rating={r}>
                <ReportRatingButton ratingId={r.id} />
              </RatingCard>
            ))}
          </div>
        ) : (
          <p className="card p-5 text-sm text-muted">Todavía no hay opiniones publicadas.</p>
        )}
        <Pagination page={ratings.page} totalPages={ratings.totalPages} hrefFor={(p) => `/organizer/${username}/trust${qs({ page: p, estrellas: sp.estrellas })}`} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold uppercase">Incidencias confirmadas</h2>
        <IncidentList incidents={summary.confirmedIncidents} />
        <p className="text-xs text-muted">
          Solo se publican incidencias confirmadas tras una revisión administrativa. Los reportes sin verificar no afectan la
          reputación.
        </p>
      </section>
    </div>
  );
}
