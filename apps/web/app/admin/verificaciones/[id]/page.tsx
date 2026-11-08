import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, FileText } from 'lucide-react';
import { apiOrNull } from '@/lib/api';
import type { Reputation, VerificationStatus } from '@/lib/types';
import { COUNTRIES, flag, formatDate, formatDateTime, ORGANIZER_TYPE_LABEL, REPUTATION_LABEL, VERIFICATION_LABEL } from '@/lib/format';
import { Avatar } from '@/components/ui';
import { OpenPrivateFile, VerificationActions } from '../../admin-forms';

export const metadata: Metadata = { title: 'Solicitud de verificación' };

interface Detail {
  id: string;
  status: VerificationStatus;
  verificationType: string;
  organizerName: string;
  legalName: string | null;
  country: string;
  city: string;
  contactEmail: string;
  contactPhone: string;
  description: string;
  website: string | null;
  socialLinks: Record<string, string>;
  logoUrl: string | null;
  policyAcceptedAt: string;
  submittedAt: string;
  reviewedAt: string | null;
  approvedAt: string | null;
  expiresAt: string | null;
  rejectionReason: string | null;
  adminNotes: string | null;
  infoRequested: string | null;
  reviewer: { username: string } | null;
  organizer: {
    id: string;
    displayName: string;
    logoUrl: string | null;
    verificationStatus: VerificationStatus;
    createdAt: string;
    user: { username: string; email: string; createdAt: string };
    reputation: Reputation | null;
    _count: { tournaments: number };
  };
  documents: { id: string; documentType: string; originalName: string | null; mimeType: string | null; uploadedAt: string; reviewStatus: string; deleteAfter: string | null }[];
  history: { id: string; previousStatus: VerificationStatus | null; newStatus: VerificationStatus; reason: string | null; comments: string | null; createdAt: string; changer: { username: string } | null }[];
}

export default async function AdminVerificationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await apiOrNull<Detail>(`/admin/verifications/${id}`);
  if (!v) notFound();
  const o = v.organizer;

  return (
    <div className="space-y-5">
      <Link href="/admin/verificaciones" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Solicitudes
      </Link>

      <header className="flex flex-wrap items-center gap-4">
        <Avatar src={v.logoUrl ?? o.logoUrl} name={v.organizerName} size={64} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl font-bold">{v.organizerName}</h2>
          <p className="text-sm text-muted">
            {ORGANIZER_TYPE_LABEL[v.verificationType]} · <Link href={`/organizer/${o.user.username}`} className="hover:text-ink">@{o.user.username}</Link> · cuenta creada {formatDate(o.user.createdAt)}
          </p>
        </div>
        <span className="chip text-base">{VERIFICATION_LABEL[v.status]}</span>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-5">
          <section className="card grid gap-x-6 gap-y-2 p-5 text-sm sm:grid-cols-2">
            <Info label="Razón social" value={v.legalName ?? '—'} />
            <Info label="Ubicación" value={`${flag(v.country)} ${v.city}, ${COUNTRIES[v.country] ?? v.country}`} />
            <Info label="Correo de contacto" value={v.contactEmail} />
            <Info label="Teléfono" value={v.contactPhone} />
            <Info label="Sitio web" value={v.website ?? '—'} />
            <Info label="Políticas aceptadas" value={formatDateTime(v.policyAcceptedAt)} />
            <div className="sm:col-span-2">
              <p className="text-xs text-muted">Descripción</p>
              <p className="whitespace-pre-line">{v.description}</p>
            </div>
            {Object.keys(v.socialLinks ?? {}).length > 0 && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted">Redes sociales</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(v.socialLinks).map(([k, url]) => (
                    <a key={k} href={url} target="_blank" rel="noopener noreferrer nofollow" className="chip hover:text-neon">
                      {k}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="card space-y-3 p-5">
            <h3 className="font-bold">Documentación privada</h3>
            {v.documents.length ? (
              <ul className="space-y-2">
                {v.documents.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <FileText className="size-4 text-muted" />
                    <span className="min-w-0 flex-1 truncate">
                      {d.originalName ?? d.documentType} <span className="text-xs text-muted">· {d.documentType} · {formatDateTime(d.uploadedAt)}</span>
                      {d.deleteAfter && <span className="text-xs text-amber"> · se elimina el {formatDate(d.deleteAfter)}</span>}
                    </span>
                    <OpenPrivateFile kind="verification" id={v.id} documentId={d.id} label="Ver (enlace de 5 min)" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Sin documentos (no adjuntados o eliminados por la política de conservación).</p>
            )}
            <p className="text-xs text-muted">Cada apertura genera un enlace temporal y queda registrada en la auditoría.</p>
          </section>

          <section className="card p-5">
            <h3 className="mb-3 font-bold">Historial de cambios</h3>
            <ol className="space-y-3 border-l border-line pl-4 text-sm">
              {v.history.map((h) => (
                <li key={h.id}>
                  <p>
                    <b>{h.previousStatus ? `${VERIFICATION_LABEL[h.previousStatus]} → ` : ''}{VERIFICATION_LABEL[h.newStatus]}</b>
                    <span className="text-xs text-muted"> · {formatDateTime(h.createdAt)} · {h.changer ? `@${h.changer.username}` : 'sistema'}</span>
                  </p>
                  {h.reason && <p className="text-muted">Motivo: {h.reason}</p>}
                  {h.comments && <p className="text-xs text-muted">Observaciones: {h.comments}</p>}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="card space-y-3 p-5">
            <h3 className="font-bold">Decisión</h3>
            {v.infoRequested && <p className="rounded-xl bg-amber/10 p-3 text-sm text-amber">Esperando información: {v.infoRequested}</p>}
            {v.rejectionReason && <p className="text-sm text-muted">Rechazo: {v.rejectionReason}</p>}
            {v.expiresAt && <p className="text-sm text-muted">Vigente hasta el {formatDate(v.expiresAt)}</p>}
            <VerificationActions id={v.id} status={v.status} />
          </section>
          {v.adminNotes && (
            <section className="card p-5">
              <h3 className="mb-2 font-bold">Notas internas</h3>
              <p className="whitespace-pre-line text-xs text-muted">{v.adminNotes}</p>
            </section>
          )}
          <section className="card space-y-1 p-5 text-sm">
            <h3 className="mb-2 font-bold">Contexto (independiente de la verificación)</h3>
            <p>Partidas creadas: {o._count.tournaments}</p>
            <p>
              Reputación: {o.reputation?.totalRatings ? `${Number(o.reputation.averageScore).toFixed(2)} ★ (${o.reputation.totalRatings})` : 'sin valoraciones'} ·{' '}
              {REPUTATION_LABEL[o.reputation?.reputationLevel ?? 'NEW']}
            </p>
            <p>Incidencias confirmadas: {o.reputation?.confirmedIncidents ?? 0}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted">{label}</p>
      <p className="truncate">{value}</p>
    </div>
  );
}
