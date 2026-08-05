# Project Maze – Browser-Client (statisches Vite-Bundle hinter nginx)
# Build aus dem Repository-Wurzelverzeichnis:
#   docker build -f apps/client/Dockerfile --build-arg VITE_WS_URL=wss://example.com/ws -t project-maze-client .

FROM node:22-alpine AS build
WORKDIR /repo
ENV CI=true
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/client apps/client
# Leer lassen, damit der Client auf ws(s)://<hostname>:2567 zurückfällt.
ARG VITE_WS_URL=""
ENV VITE_WS_URL=$VITE_WS_URL
RUN npm run build -w @project-maze/shared \
  && npm run build -w @project-maze/client

FROM nginx:stable-alpine AS runtime
# Upstream des Spielservers; im Compose-Netz der Servicename.
ENV MAZE_SERVER_UPSTREAM=server:2567
COPY apps/client/nginx.conf /etc/nginx/maze-default.conf.template
COPY apps/client/docker-entrypoint.d/10-maze-upstream.sh /docker-entrypoint.d/10-maze-upstream.sh
RUN chmod +x /docker-entrypoint.d/10-maze-upstream.sh
COPY --from=build /repo/apps/client/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/index.html || exit 1
