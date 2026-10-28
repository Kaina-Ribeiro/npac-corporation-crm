# NPAC Corporation

CRM em monorepo (pnpm + Turborepo): `apps/*` (api NestJS, web Next.js) e `packages/*` (`@npac/*`).

## Pré-requisitos

- Node.js >= 22 (testado com 24)
- pnpm 12 (`corepack enable`)
- Docker com Compose

## Começando

```bash
cp .env.example .env   # preencha as senhas e gere as chaves (openssl rand -base64 32)
docker compose up -d   # Postgres 16 (5432) e Redis 7 (6379)
pnpm install
```

## Comandos

- `pnpm dev` — sobe os apps em modo desenvolvimento
- `pnpm build` — build de todos os pacotes
- `pnpm test` — testes
- `pnpm lint` — ESLint
- `pnpm typecheck` — TypeScript
- `pnpm turbo run lint typecheck test` — verificação completa (a mesma do CI)
