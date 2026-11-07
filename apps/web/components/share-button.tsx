'use client';

import { useState } from 'react';
import { Check, Share2 } from 'lucide-react';

/** Comparte el enlace público de la partida (Web Share API o copia al portapapeles). */
export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = window.location.href.split('#')[0]!;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        /* cancelado por el usuario */
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button type="button" onClick={share} className="btn-ghost">
      {copied ? <Check className="size-4 text-lime" /> : <Share2 className="size-4" />}
      {copied ? 'Enlace copiado' : 'Compartir'}
    </button>
  );
}
