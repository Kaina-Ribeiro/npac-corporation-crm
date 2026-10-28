import path from 'node:path';
import type { NextConfig } from 'next';

const api = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const config: NextConfig = {
  poweredByHeader: false,
  // `next dev` acessado por túnel temporário (teste remoto).
  allowedDevOrigins: ['*.trycloudflare.com'],
  // Docker: servidor standalone com rastreamento a partir da raiz do monorepo.
  ...(process.env.NEXT_OUTPUT === 'standalone'
    ? { output: 'standalone' as const, outputFileTracingRoot: path.resolve(process.cwd(), '../..') }
    : {}),
  // Mesma origem: o navegador só fala com o web, que repassa /api/* para a API.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
};

export default config;
