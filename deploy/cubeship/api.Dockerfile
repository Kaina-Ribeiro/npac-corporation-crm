# syntax=docker/dockerfile:1.7
# Imagem da API para o Cubeship (que escolhe o Dockerfile, mas não o target).
# Mesma imagem para dois apps: NPAC_PROCESS=api (padrão: migra e sobe a API) ou
# NPAC_PROCESS=retention (worker LGPD diário, sem HTTP).
FROM node:24-alpine AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@12.14.0 --activate
WORKDIR /repo
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@npac/api
RUN pnpm --filter=@npac/api deploy --prod --legacy /out/api

FROM node:24-alpine
ENV NODE_ENV=production API_PORT=4000 NPAC_PROCESS=api
WORKDIR /app
COPY --from=build --chown=node:node /out/api ./
COPY --chown=node:node deploy/cubeship/start-api.sh ./start.sh
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD [ "$NPAC_PROCESS" = retention ] || wget -qO- http://127.0.0.1:4000/api/health || exit 1
CMD ["/bin/sh", "start.sh"]
