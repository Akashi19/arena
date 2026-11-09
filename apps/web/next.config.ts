import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // Reproductores embebidos (módulo 23): los marcos solo pueden venir de estos hosts y nadie puede enmarcar Arena
  async headers() {
    const frames = [
      "'self'",
      'https://www.youtube-nocookie.com',
      'https://player.twitch.tv',
      'https://player.kick.com',
      'https://www.facebook.com',
      'https://player.vimeo.com',
    ].join(' ');
    return [{ source: '/:path*', headers: [{ key: 'Content-Security-Policy', value: `frame-src ${frames}; frame-ancestors 'self'` }] }];
  },
  experimental: {
    // Logos/portadas (5 MB) y documentos de verificación (hasta 5 archivos; la web limita a 25 MB en total)
    serverActions: { bodySizeLimit: '26mb' },
  },
};

export default nextConfig;
