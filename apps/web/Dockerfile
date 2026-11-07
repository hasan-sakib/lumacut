# Build context: repository root (see infra/docker-compose.yml).
# Serves the production build with `vite preview` (same COOP/COEP headers and /api proxy as dev).
FROM node:26-trixie-slim

# Node 25+ no longer bundles corepack; install the pnpm version pinned in package.json.
RUN npm install -g pnpm@10.34.9

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY packages/schema/package.json packages/schema/package.json
COPY packages/actions/package.json packages/actions/package.json
COPY packages/effects/package.json packages/effects/package.json
COPY packages/engine/package.json packages/engine/package.json
COPY packages/ops/package.json packages/ops/package.json
# "@lumacut/web..." = the app plus the workspace packages it depends on.
RUN pnpm install --frozen-lockfile --filter "@lumacut/web..."

COPY tsconfig.base.json ./
COPY packages/schema/src packages/schema/src
COPY packages/actions/src packages/actions/src
COPY packages/effects/src packages/effects/src
COPY packages/engine/src packages/engine/src
COPY packages/ops/src packages/ops/src
COPY apps/web apps/web
RUN pnpm --filter @lumacut/web build

ENV LUMACUT_API_PROXY_TARGET=http://api:8000
EXPOSE 8080
CMD ["pnpm", "--filter", "@lumacut/web", "preview"]
