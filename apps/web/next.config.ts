import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: '6mb' }, // subida de logos/portadas (la API limita a 5 MB)
  },
};

export default nextConfig;
