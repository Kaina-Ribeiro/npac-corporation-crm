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
  // Só o build do e2e liga isto (playwright.config.ts e ci.yml): pula a checagem de tipos, que o
  // `pnpm typecheck` e o job `static` do CI já fazem. O build de produção nunca define a variável.
  ...(process.env.NEXT_SKIP_TYPECHECK === '1' ? { typescript: { ignoreBuildErrors: true } } : {}),
  // Mesma origem: o navegador só fala com o web, que repassa /api/* para a API.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
};

export default config;
