# syntax=docker/dockerfile:1.7
# Imagem do web (Next standalone) para o Cubeship.
FROM node:24-alpine AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@12.14.0 --activate
WORKDIR /repo
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
# O rewrite /api/* do Next é resolvido no build: endereço interno do app da API no Cubeship.
ARG API_INTERNAL_URL=http://cubeship-npac-production-api:4000
ENV API_INTERNAL_URL=$API_INTERNAL_URL NEXT_OUTPUT=standalone
RUN pnpm turbo run build --filter=@npac/web

FROM node:24-alpine
ARG API_INTERNAL_URL=http://cubeship-npac-production-api:4000
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1 \
  API_INTERNAL_URL=$API_INTERNAL_URL
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
