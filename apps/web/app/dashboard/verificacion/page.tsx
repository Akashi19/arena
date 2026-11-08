import type { Metadata } from 'next';
import Link from 'next/link';
import { BadgeCheck, Clock, FileText, Info, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { requireOrganizer } from '@/lib/session';
import type { MyVerification, VerificationRequest } from '@/lib/types';
import { formatDate, formatDateTime, ORGANIZER_TYPE_LABEL, VERIFICATION_LABEL } from '@/lib/format';
import { InfoForm, VerificationForm } from './verification-forms';

export const metadata: Metadata = { title: 'Verificación' };

const TONE: Record<string, string> = {
  VERIFIED: 'border-verified/50 bg-verified/10 text-verified',
  PENDING: 'border-amber/40 bg-amber/10 text-amber',
  UNDER_REVIEW: 'border-amber/40 bg-amber/10 text-amber',
  REJECTED: 'border-danger/40 bg-danger/10 text-danger',
  SUSPENDED: 'border-danger/40 bg-danger/10 text-danger',
  EXPIRED: 'border-line bg-surface-2 text-muted',
  NOT_REQUESTED: 'border-line bg-surface-2 text-muted',
};

export default async function VerificationPage() {
  await requireOrganizer('/dashboard/verificacion');
  const v = await api<MyVerification>('/me/verification');
  const cur = v.current;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="section-title">Verificación</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          La insignia azul indica que revisamos la identidad y la información pública de tu organización. Es independiente de
          tu plan y de tu reputación: no se compra ni se asigna automáticamente, y no es una garantía absoluta de cumplimiento.
        </p>
      </div>

      <section className={`flex flex-wrap items-center gap-4 rounded-2xl border p-5 ${TONE[v.status]}`}>
        {v.status === 'VERIFIED' ? <BadgeCheck className="size-8" /> : v.status === 'SUSPENDED' || v.status === 'REJECTED' ? <ShieldAlert className="size-8" /> : <Clock className="size-8" />}
        <div className="min-w-0 flex-1">
          <p className="font-display text-2xl font-bold">{VERIFICATION_LABEL[v.status]}</p>
          <p className="text-sm text-ink/80">
            {v.status === 'VERIFIED' && cur?.expiresAt && `Verificado desde ${formatDate(v.verifiedAt ?? cur.approvedAt!)} · vence el ${formatDate(cur.expiresAt)}`}
            {(v.status === 'PENDING' || v.status === 'UNDER_REVIEW') && cur && `Solicitud enviada el ${formatDateTime(cur.submittedAt)}`}
            {v.status === 'REJECTED' && cur?.rejectionReason && `Motivo: ${cur.rejectionReason}. Puedes corregirlo y volver a enviar la solicitud.`}
            {v.status === 'SUSPENDED' && 'La insignia no se muestra mientras la verificación esté suspendida. Contacta al equipo de la plataforma.'}
            {v.status === 'EXPIRED' && 'Tu verificación venció: envía una nueva solicitud para una nueva revisión.'}
            {v.status === 'NOT_REQUESTED' && 'Aún no solicitaste la verificación.'}
          </p>
        </div>
      </section>

      {cur?.infoRequested && (
        <section className="card space-y-3 border-amber/50 p-5">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Info className="size-5 text-amber" /> Información adicional solicitada
          </h2>
          <p className="rounded-xl bg-surface-2 p-3 text-sm">{cur.infoRequested}</p>
          <InfoForm />
        </section>
      )}

      {v.canRequest && (
        <section className="card space-y-4 p-5">
          <h2 className="text-xl font-bold uppercase">Solicitar verificación</h2>
          {!v.prefill.logoUrl && (
            <p className="rounded-xl border border-amber/40 bg-amber/10 p-3 text-sm text-amber">
              Primero sube tu logo oficial en{' '}
              <Link href="/dashboard/perfil" className="font-semibold underline">
                Perfil y logo
              </Link>
              .
            </p>
          )}
          <VerificationForm prefill={v.prefill} />
        </section>
      )}

      {cur && <RequestDetail r={cur} title="Solicitud actual" />}
      {v.previous.map((r) => (
        <RequestDetail key={r.id} r={r} title={`Solicitud del ${formatDate(r.submittedAt)}`} collapsed />
      ))}
    </div>
  );
}

function RequestDetail({ r, title, collapsed = false }: { r: VerificationRequest; title: string; collapsed?: boolean }) {
  return (
    <details open={!collapsed} className="card p-5">
      <summary className="cursor-pointer text-lg font-bold">
        {title} · <span className="text-muted">{VERIFICATION_LABEL[r.status]}</span>
      </summary>
      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <div className="space-y-2 text-sm">
          <p>
            <span className="text-muted">Organizador:</span> {r.organizerName} ({ORGANIZER_TYPE_LABEL[r.verificationType]})
          </p>
          <p className="text-muted">Documentos (privados, solo visibles para el equipo de verificación):</p>
          {r.documents.length ? (
            <ul className="space-y-1">
              {r.documents.map((d) => (
                <li key={d.id} className="flex items-center gap-2">
                  <FileText className="size-4 text-muted" /> {d.originalName ?? d.documentType}
                  <span className="text-xs text-muted">· {formatDate(d.uploadedAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted">Sin documentos o ya eliminados según la política de conservación.</p>
          )}
        </div>
        <ol className="space-y-2 border-l border-line pl-4 text-sm">
          {r.history.map((h, i) => (
            <li key={i}>
              <p className="font-semibold">{VERIFICATION_LABEL[h.newStatus]}</p>
              <p className="text-xs text-muted">
                {formatDateTime(h.createdAt)}
                {h.reason && ` · ${h.reason}`}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}
