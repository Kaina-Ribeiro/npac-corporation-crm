# syntax=docker/dockerfile:1.7
# Imagens de produção: `docker build --target api .` e `docker build --target web .`
FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@12.14.0 --activate
WORKDIR /repo

FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
# O rewrite /api/* do Next é resolvido no build: aponta para o serviço interno da API.
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=$API_INTERNAL_URL NEXT_OUTPUT=standalone
RUN pnpm turbo run build --filter=@npac/api --filter=@npac/web
RUN pnpm --filter=@npac/api deploy --prod --legacy /out/api

FROM node:24-alpine AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/api ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
CMD ["node", "dist/main.js"]

FROM node:24-alpine AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
