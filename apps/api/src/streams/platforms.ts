/**
 * Validación de enlaces de transmisión (módulo 23). Funciones puras: solo HTTPS, dominios autorizados,
 * plataforma detectada por el dominio y, cuando la plataforma lo admite, un identificador para el
 * reproductor embebido. La web construye el `src` del iframe a partir de `{ provider, id }` con su propia
 * lista de hosts: nunca se incrusta HTML ni URLs arbitrarias del organizador.
 */
import type { StreamPlatform } from '../generated/prisma/client.js';

export interface StreamEmbed {
  provider: 'youtube' | 'twitch' | 'twitch-video' | 'kick' | 'facebook' | 'vimeo';
  id: string;
}

export interface ParsedStreamUrl {
  url: string;
  platform: StreamPlatform;
  embed: StreamEmbed | null;
}

/** Dominios autorizados por plataforma (se aceptan también sus subdominios listados). */
export const PLATFORM_HOSTS: Record<Exclude<StreamPlatform, 'OTHER'>, string[]> = {
  YOUTUBE: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'],
  TWITCH: ['twitch.tv', 'www.twitch.tv', 'm.twitch.tv'],
  FACEBOOK: ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com', 'fb.watch'],
  TIKTOK: ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com'],
  KICK: ['kick.com', 'www.kick.com'],
};

/** "Otras plataformas compatibles": lista cerrada, ampliable con `STREAM_EXTRA_DOMAINS` (separados por coma). */
export const OTHER_HOSTS = ['vimeo.com', 'www.vimeo.com', 'trovo.live', 'www.trovo.live', 'rumble.com', 'www.rumble.com', 'dlive.tv', 'www.dlive.tv'];

export function extraHosts(env = process.env.STREAM_EXTRA_DOMAINS) {
  return (env ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h));
}

export const PLATFORM_NAME: Record<StreamPlatform, string> = {
  YOUTUBE: 'YouTube Live',
  TWITCH: 'Twitch',
  FACEBOOK: 'Facebook Live',
  TIKTOK: 'TikTok Live',
  KICK: 'Kick',
  OTHER: 'Otra plataforma',
};

export class StreamUrlError extends Error {}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const SLUG = /^[A-Za-z0-9_]{2,40}$/;
const KICK_SLUG = /^[A-Za-z0-9_-]{2,40}$/;
const TWITCH_RESERVED = new Set(['directory', 'videos', 'settings', 'search', 'downloads', 'jobs', 'p', 'subscriptions', 'inventory', 'wallet', 'turbo']);

export function parseStreamUrl(raw: string, extra: string[] = extraHosts()): ParsedStreamUrl {
  const value = raw.trim();
  if (!value) throw new StreamUrlError('Ingresa la URL de la transmisión');
  if (value.length > 500) throw new StreamUrlError('La URL es demasiado larga');
  // Caracteres de control o espacios: típicos de intentos de inyección o URLs malformadas
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f<>"'`\\]/.test(value)) throw new StreamUrlError('La URL contiene caracteres no permitidos');
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new StreamUrlError('El formato de la URL no es válido');
  }
  if (u.protocol !== 'https:') throw new StreamUrlError('Solo se aceptan enlaces HTTPS');
  if (u.username || u.password) throw new StreamUrlError('La URL no puede incluir credenciales');
  if (u.port) throw new StreamUrlError('La URL no puede indicar un puerto');
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (/^[\d.]+$/.test(host) || host.includes(':')) throw new StreamUrlError('Usa el dominio de la plataforma, no una dirección IP');

  const platform = detectPlatform(host, extra);
  if (!platform) throw new StreamUrlError('Dominio no autorizado. Usa YouTube, Twitch, Facebook, TikTok, Kick u otra plataforma de la lista permitida');
  u.hostname = host;
  u.hash = '';
  return { url: u.toString(), platform, embed: embedFor(platform, u) };
}

export function detectPlatform(host: string, extra: string[] = []): StreamPlatform | null {
  for (const [platform, hosts] of Object.entries(PLATFORM_HOSTS)) if (hosts.includes(host)) return platform as StreamPlatform;
  if (OTHER_HOSTS.includes(host) || extra.includes(host)) return 'OTHER';
  return null;
}

function embedFor(platform: StreamPlatform, u: URL): StreamEmbed | null {
  const parts = u.pathname.split('/').filter(Boolean);
  const host = u.hostname;
  switch (platform) {
    case 'YOUTUBE': {
      let id: string | null = null;
      if (host === 'youtu.be') id = parts[0] ?? null;
      else if (parts[0] === 'watch') id = u.searchParams.get('v');
      else if (['live', 'embed', 'shorts'].includes(parts[0] ?? '')) id = parts[1] ?? null;
      return id && YT_ID.test(id) ? { provider: 'youtube', id } : null;
    }
    case 'TWITCH': {
      if (parts[0] === 'videos' && /^\d{5,15}$/.test(parts[1] ?? '')) return { provider: 'twitch-video', id: parts[1] };
      const ch = parts[0];
      return parts.length === 1 && ch && SLUG.test(ch) && !TWITCH_RESERVED.has(ch.toLowerCase()) ? { provider: 'twitch', id: ch.toLowerCase() } : null;
    }
    case 'KICK': {
      const ch = parts[0];
      return parts.length === 1 && ch && KICK_SLUG.test(ch) ? { provider: 'kick', id: ch.toLowerCase() } : null;
    }
    case 'FACEBOOK':
      // El plugin de video recibe la URL pública ya validada (solo videos y vivos, no perfiles)
      return host !== 'fb.watch' && (parts.includes('videos') || parts[0] === 'watch' || parts[0] === 'live') ? { provider: 'facebook', id: u.toString() } : null;
    case 'OTHER':
      return (host === 'vimeo.com' || host === 'www.vimeo.com') && /^\d{4,12}$/.test(parts[0] ?? '') && parts.length === 1
        ? { provider: 'vimeo', id: parts[0] }
        : null;
    default:
      // TikTok Live no ofrece reproductor embebido para directos: solo enlace
      return null;
  }
}
