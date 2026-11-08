import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  experimental: {
    // Logos/portadas (5 MB) y documentos de verificación (hasta 5 archivos; la web limita a 25 MB en total)
    serverActions: { bodySizeLimit: '26mb' },
  },
};

export default nextConfig;
