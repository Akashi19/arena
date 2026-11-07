'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { BadgeCheck, X } from 'lucide-react';
import { formatDate, ORGANIZER_TYPE_LABEL, VERIFICATION_LABEL, COUNTRIES } from '@/lib/format';
import type { OrganizerPublic } from '@/lib/types';

/**
 * Insignia azul de organizador verificado. Solo aparece con estado VERIFIED
 * (una verificación suspendida o vencida la retira). Al pulsarla muestra
 * la información pública validada.
 */
export function VerifiedBadge({ organizer, size = 16 }: { organizer: OrganizerPublic; size?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (organizer.verificationStatus !== 'VERIFIED') return null;

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-controls={id}
        aria-label="Organizador verificado: ver detalles"
        className="text-verified transition hover:scale-110"
      >
        <BadgeCheck style={{ width: size, height: size }} className="fill-verified/20" />
      </button>
      {open && (
        <div
          id={id}
          role="dialog"
          className="absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 rounded-2xl border border-verified/40 bg-surface-2 p-4 text-left shadow-2xl shadow-black/60"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 text-verified">
              <BadgeCheck className="size-5 fill-verified/20" />
              <span className="font-display text-lg font-bold">Organizador verificado</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="text-muted hover:text-ink">
              <X className="size-4" />
            </button>
          </div>
          <dl className="space-y-1.5 text-sm">
            <Row k="Organizador" v={organizer.displayName} />
            <Row k="Estado" v={VERIFICATION_LABEL[organizer.verificationStatus]} />
            {organizer.verifiedAt && <Row k="Aprobado el" v={formatDate(organizer.verifiedAt)} />}
            <Row k="Tipo" v={ORGANIZER_TYPE_LABEL[organizer.organizerType] ?? organizer.organizerType} />
            <Row k="Ubicación" v={`${organizer.city}, ${COUNTRIES[organizer.country] ?? organizer.country}`} />
          </dl>
          <p className="mt-3 border-t border-line pt-2 text-xs leading-relaxed text-muted">
            La verificación confirma que la plataforma revisó la identidad e información del organizador. No es una garantía
            absoluta de cumplimiento: consulta también su reputación.
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}
