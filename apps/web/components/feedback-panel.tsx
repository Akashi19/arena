'use client';

import { useState } from 'react';
import { AlertTriangle, Star } from 'lucide-react';
import { rateOrganizerAction, reportIncidentAction } from '@/app/actions';
import type { TournamentFeedback } from '@/lib/types';
import { formatDate, INCIDENT_STATUS_LABEL, INCIDENT_TYPE_LABEL, MODERATION_LABEL, RATING_CRITERIA } from '@/lib/format';
import { FormMessage, SubmitButton, usePersistentAction } from '@/components/forms';

/** Valoración del organizador e incidencias, visible solo para participantes de la partida. */
export function FeedbackPanel({
  feedback,
  tournamentId,
  slug,
  organizerId,
  organizerName,
}: {
  feedback: TournamentFeedback;
  tournamentId: string;
  slug: string;
  organizerId: string;
  organizerName: string;
}) {
  const [editing, setEditing] = useState(false);
  const r = feedback.rating;

  return (
    <section className="card space-y-4 p-5">
      <h2 className="text-lg font-bold uppercase">Tu experiencia</h2>

      {r && !editing && (
        <div className="space-y-2 text-sm">
          <p>
            Valoraste a {organizerName} con <b className="text-amber">{Number(r.finalScore).toFixed(2)} ★</b>
            {r.moderationStatus !== 'APPROVED' && <span className="ml-1 text-xs text-muted">({MODERATION_LABEL[r.moderationStatus]})</span>}
          </p>
          {r.comment && <p className="text-muted">“{r.comment}”</p>}
          {feedback.canEdit ? (
            <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setEditing(true)}>
              Editar (hasta el {formatDate(r.editableUntil)})
            </button>
          ) : (
            <p className="text-xs text-muted">El plazo de edición terminó.</p>
          )}
        </div>
      )}

      {(feedback.canRate || editing) && (
        <RatingForm
          tournamentId={tournamentId}
          slug={slug}
          organizerId={organizerId}
          organizerName={organizerName}
          rating={editing ? r : null}
          onDone={() => setEditing(false)}
        />
      )}
      {!r && !feedback.canRate && feedback.reason && <p className="text-sm text-muted">{feedback.reason}.</p>}

      {feedback.canReportIncident && <IncidentForm tournamentId={tournamentId} slug={slug} />}
      {feedback.incidents.length > 0 && (
        <ul className="space-y-1.5 text-xs">
          {feedback.incidents.map((i) => (
            <li key={i.id} className="rounded-lg bg-surface-2 p-2">
              <b>{INCIDENT_TYPE_LABEL[i.incidentType]}</b> · {INCIDENT_STATUS_LABEL[i.status]} · {formatDate(i.createdAt)}
              {i.resolution && <p className="mt-0.5 text-muted">Resolución: {i.resolution}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RatingForm({
  tournamentId,
  slug,
  organizerId,
  organizerName,
  rating,
  onDone,
}: {
  tournamentId: string;
  slug: string;
  organizerId: string;
  organizerName: string;
  rating: TournamentFeedback['rating'];
  onDone: () => void;
}) {
  const [state, onSubmit, pending] = usePersistentAction(rateOrganizerAction, {});
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="organizerId" value={organizerId} />
      <input type="hidden" name="slug" value={slug} />
      {rating && <input type="hidden" name="ratingId" value={rating.id} />}
      <p className="text-sm text-muted">¿Cómo fue la organización de {organizerName}? Califica cada criterio de 1 a 5.</p>
      {RATING_CRITERIA.map((c) => (
        <StarInput key={c.key} name={c.key} label={c.label} defaultValue={rating?.[c.key]} />
      ))}
      <label className="block">
        <span className="label">Comentario (opcional, público con tu nickname)</span>
        <textarea name="comment" defaultValue={rating?.comment ?? ''} maxLength={1000} rows={3} className="input" />
      </label>
      <p className="text-[11px] text-muted">
        Puedes editarla durante 7 días y cada cambio queda registrado. No aceptes incentivos a cambio de una valoración.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pending={pending} pendingText="Enviando…">
          {rating ? 'Guardar cambios' : 'Enviar valoración'}
        </SubmitButton>
        {rating && (
          <button type="button" className="btn-ghost" onClick={onDone}>
            Cancelar
          </button>
        )}
      </div>
      <FormMessage state={state} />
    </form>
  );
}

function StarInput({ name, label, defaultValue }: { name: string; label: string; defaultValue?: number }) {
  const [value, setValue] = useState(defaultValue ?? 0);
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <fieldset className="flex flex-wrap items-center justify-between gap-2">
      <legend className="sr-only">{label}</legend>
      <span className="text-sm">{label}</span>
      <span className="flex" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer p-0.5" onMouseEnter={() => setHover(n)}>
            <input type="radio" name={name} value={n} required checked={value === n} onChange={() => setValue(n)} aria-label={`${label}: ${n} de 5`} className="peer sr-only" />
            <Star
              className={`size-6 transition peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-neon ${n <= shown ? 'text-amber' : 'text-surface-3'}`}
              fill="currentColor"
              strokeWidth={0}
              aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`}
            />
          </label>
        ))}
      </span>
    </fieldset>
  );
}

function IncidentForm({ tournamentId, slug }: { tournamentId: string; slug: string }) {
  const [open, setOpen] = useState(false);
  const [state, onSubmit, pending] = usePersistentAction(reportIncidentAction, {});
  if (!open) {
    return (
      <button type="button" className="flex items-center gap-1.5 text-xs text-muted hover:text-danger" onClick={() => setOpen(true)}>
        <AlertTriangle className="size-3.5" /> Reportar una incidencia
      </button>
    );
  }
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-2 rounded-xl border border-danger/30 bg-danger/5 p-3">
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <input type="hidden" name="slug" value={slug} />
      <label className="block">
        <span className="label">Tipo</span>
        <select name="incidentType" className="input">
          {Object.entries(INCIDENT_TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">Descripción (mín. 20 caracteres)</span>
        <textarea name="description" required minLength={20} maxLength={3000} rows={3} className="input" />
      </label>
      <label className="block">
        <span className="label">Evidencia (opcional: captura o PDF, privada)</span>
        <input type="file" name="evidence" accept="application/pdf,image/jpeg,image/png,image/webp" className="input" />
      </label>
      <p className="text-[11px] text-muted">La revisa el equipo de la plataforma. Solo las incidencias confirmadas se publican.</p>
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton pending={pending} className="btn-danger" pendingText="Enviando…">
          Enviar incidencia
        </SubmitButton>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
