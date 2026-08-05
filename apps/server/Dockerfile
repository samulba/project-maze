# Project Maze – autoritativer Spielserver
# Build aus dem Repository-Wurzelverzeichnis:
#   docker build -f apps/server/Dockerfile -t project-maze-server .

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
COPY apps/server apps/server
RUN npm run build -w @project-maze/shared \
  && npm run build -w @project-maze/server

# Nur Produktionsabhängigkeiten für das Laufzeit-Image auflösen.
FROM node:22-alpine AS deps
WORKDIR /repo
ENV CI=true
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
RUN npm ci --omit=dev --no-audit --no-fund --workspace @project-maze/server --include-workspace-root

FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production
ENV PORT=2567
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/package.json ./package.json
COPY --from=build /repo/packages/shared/package.json packages/shared/package.json
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/server/package.json apps/server/package.json
COPY --from=build /repo/apps/server/dist apps/server/dist
USER node
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||2567)+'/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/server/dist/index.js"]
