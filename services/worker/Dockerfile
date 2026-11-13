# Build context: repository root (see infra/docker-compose.yml).

# --- The render page server exports draw with (apps/render-page, a static Vite build) ---------
FROM node:26-trixie-slim AS render-page
RUN npm install -g pnpm@10.34.9
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/render-page/package.json apps/render-page/package.json
COPY packages/schema/package.json packages/schema/package.json
COPY packages/effects/package.json packages/effects/package.json
COPY packages/engine/package.json packages/engine/package.json
COPY packages/ops/package.json packages/ops/package.json
RUN pnpm install --frozen-lockfile --filter "@lumacut/render-page..."
COPY tsconfig.base.json ./
COPY packages/schema/src packages/schema/src
COPY packages/effects/src packages/effects/src
COPY packages/engine/src packages/engine/src
COPY packages/ops/src packages/ops/src
# The bundled fonts (the page's public folder is the editor's).
COPY apps/web/public apps/web/public
COPY apps/render-page apps/render-page
RUN pnpm --filter @lumacut/render-page build

# --- The worker -----------------------------------------------------------------------------
FROM python:3.12-slim-trixie

# FFmpeg (Debian build, GPL: fine for server-side use) and a font for drawtext in sample media.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.10.7 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH=/opt/venv/bin:$PATH \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY pyproject.toml uv.lock .python-version ./
COPY packages/schema/py/pyproject.toml packages/schema/py/pyproject.toml
COPY services/core/pyproject.toml services/core/pyproject.toml
COPY services/api/pyproject.toml services/api/pyproject.toml
COPY services/worker/pyproject.toml services/worker/pyproject.toml
RUN uv sync --frozen --no-dev --group test --package lumacut-worker --no-install-workspace

COPY packages/schema/py packages/schema/py
COPY services/core services/core
COPY services/worker services/worker
RUN uv sync --frozen --no-dev --group test --package lumacut-worker

# Headless Chromium for server exports (Playwright, Apache-2.0), and the page it opens.
RUN playwright install --with-deps chromium
COPY --from=render-page /app/apps/render-page/dist /app/render-page

CMD ["python", "-m", "lumacut_worker.main"]
