import { describe, expect, it } from 'vitest';
import { detectPlatform, extraHosts, parseStreamUrl, StreamUrlError } from './platforms.js';

describe('parseStreamUrl', () => {
  it('detecta la plataforma por el dominio y obtiene el reproductor embebido', () => {
    expect(parseStreamUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')).toMatchObject({
      platform: 'YOUTUBE',
      embed: { provider: 'youtube', id: 'dQw4w9WgXcQ' },
    });
    expect(parseStreamUrl('https://youtu.be/dQw4w9WgXcQ').embed).toEqual({ provider: 'youtube', id: 'dQw4w9WgXcQ' });
    expect(parseStreamUrl('https://www.youtube.com/live/dQw4w9WgXcQ').embed?.id).toBe('dQw4w9WgXcQ');
    expect(parseStreamUrl('https://www.twitch.tv/LigaGamer')).toMatchObject({ platform: 'TWITCH', embed: { provider: 'twitch', id: 'ligagamer' } });
    expect(parseStreamUrl('https://www.twitch.tv/videos/123456789').embed).toEqual({ provider: 'twitch-video', id: '123456789' });
    expect(parseStreamUrl('https://kick.com/liga-gamer')).toMatchObject({ platform: 'KICK', embed: { provider: 'kick', id: 'liga-gamer' } });
    expect(parseStreamUrl('https://www.facebook.com/ligagamer/videos/987654321/')).toMatchObject({ platform: 'FACEBOOK', embed: { provider: 'facebook' } });
    expect(parseStreamUrl('https://vimeo.com/123456789')).toMatchObject({ platform: 'OTHER', embed: { provider: 'vimeo', id: '123456789' } });
  });

  it('acepta enlaces sin reproductor embebido (solo acceso por enlace)', () => {
    expect(parseStreamUrl('https://www.tiktok.com/@ligagamer/live')).toMatchObject({ platform: 'TIKTOK', embed: null });
    expect(parseStreamUrl('https://www.youtube.com/@ligagamer/live').embed).toBeNull();
    expect(parseStreamUrl('https://www.twitch.tv/directory').embed).toBeNull();
    expect(parseStreamUrl('https://fb.watch/abc123/').embed).toBeNull();
  });

  it('normaliza el host y descarta el fragmento', () => {
    expect(parseStreamUrl('https://WWW.Twitch.TV/arena#chat').url).toBe('https://www.twitch.tv/arena');
  });

  it.each([
    ['http://www.twitch.tv/arena', 'HTTPS'],
    ['javascript:alert(1)', 'HTTPS'],
    ['data:text/html,<script>', 'caracteres'],
    ['https://evil.example.com/live', 'Dominio no autorizado'],
    ['https://twitch.tv.evil.com/arena', 'Dominio no autorizado'],
    ['https://user:pass@www.twitch.tv/arena', 'credenciales'],
    ['https://www.twitch.tv:8443/arena', 'puerto'],
    ['https://192.168.0.1/live', 'IP'],
    ['https://www.twitch.tv/arena"onload=', 'caracteres'],
    ['no es una url', 'caracteres'],
    ['https:/twitch', 'Dominio no autorizado'],
  ])('rechaza %s', (url, msg) => {
    expect(() => parseStreamUrl(url)).toThrow(StreamUrlError);
    expect(() => parseStreamUrl(url)).toThrow(new RegExp(msg));
  });

  it('permite ampliar la lista de dominios autorizados por configuración', () => {
    expect(() => parseStreamUrl('https://stream.liga.cl/en-vivo', [])).toThrow(StreamUrlError);
    expect(parseStreamUrl('https://stream.liga.cl/en-vivo', extraHosts('stream.liga.cl, mal dominio,'))).toMatchObject({ platform: 'OTHER', embed: null });
    expect(detectPlatform('m.youtube.com')).toBe('YOUTUBE');
  });
});
