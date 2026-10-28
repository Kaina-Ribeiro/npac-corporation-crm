import type { NextConfig } from 'next';

const api = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const config: NextConfig = {
  poweredByHeader: false,
  // Mesma origem: o navegador só fala com o web, que repassa /api/* para a API.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
};

export default config;
