'use client';

import { useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import type { StreamEmbed } from '@/lib/types';

/**
 * Hosts de reproductor autorizados. El `src` se arma aquí a partir de `{ provider, id }` validados por la
 * API (y otra vez aquí): nunca se usa HTML ni una URL de iframe enviada por el organizador. La política
 * `frame-src` de next.config.ts limita los marcos a estos mismos dominios.
 */
const ID_RULES: Record<StreamEmbed['provider'], RegExp> = {
  youtube: /^[A-Za-z0-9_-]{11}$/,
  twitch: /^[a-z0-9_]{2,40}$/,
  'twitch-video': /^\d{5,15}$/,
  kick: /^[a-z0-9_-]{2,40}$/,
  vimeo: /^\d{4,12}$/,
  facebook: /^https:\/\/(www\.|m\.|web\.)?facebook\.com\/[^\s"'<>]+$/,
};

export function embedSrc(embed: StreamEmbed, parentHost: string): string | null {
  if (!ID_RULES[embed.provider]?.test(embed.id)) return null;
  const parent = encodeURIComponent(parentHost);
  switch (embed.provider) {
    case 'youtube':
      return `https://www.youtube-nocookie.com/embed/${embed.id}?autoplay=1&rel=0`;
    case 'twitch':
      return `https://player.twitch.tv/?channel=${embed.id}&parent=${parent}&autoplay=true`;
    case 'twitch-video':
      return `https://player.twitch.tv/?video=v${embed.id}&parent=${parent}&autoplay=true`;
    case 'kick':
      return `https://player.kick.com/${embed.id}?autoplay=true`;
    case 'vimeo':
      return `https://player.vimeo.com/video/${embed.id}?autoplay=1&dnt=1`;
    case 'facebook':
      return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(embed.id)}&show_text=false&autoplay=true`;
  }
}

/**
 * Reproductor embebido bajo demanda: no se carga contenido de terceros hasta que el usuario lo pide.
 * Siempre queda el enlace directo como alternativa si el reproductor no funciona.
 */
export function StreamPlayer({ embed, url, platformName, title }: { embed: StreamEmbed; url: string; platformName: string; title: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const load = () => {
    const s = embedSrc(embed, window.location.hostname);
    if (s) setSrc(s);
    else setError(true);
  };

  return (
    <div className="space-y-2">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-line bg-black">
        {src ? (
          <iframe
            src={src}
            title={`${title} · ${platformName}`}
            className="absolute inset-0 size-full"
            // Sin acceso a la página: solo lo que el reproductor necesita para funcionar
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
          />
        ) : (
          <button
            type="button"
            onClick={load}
            disabled={error}
            className="absolute inset-0 grid place-items-center bg-gradient-to-br from-surface-2 to-surface text-sm text-muted transition hover:text-ink disabled:cursor-not-allowed"
          >
            <span className="flex flex-col items-center gap-2">
              <span className="grid size-14 place-items-center rounded-full bg-neon text-bg shadow-neon">
                <Play className="size-6" fill="currentColor" aria-hidden />
              </span>
              {error ? 'No se puede mostrar el reproductor de esta transmisión' : `Ver aquí con el reproductor de ${platformName}`}
            </span>
          </button>
        )}
      </div>
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
        {src ? '¿El reproductor no carga o pide iniciar sesión?' : 'El reproductor se carga desde la plataforma al pulsar.'}
        <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-semibold text-neon">
          Abrir en {platformName} <ExternalLink className="size-3" aria-hidden />
        </a>
      </p>
    </div>
  );
}
