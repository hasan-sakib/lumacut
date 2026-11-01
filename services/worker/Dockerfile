# Build context: repository root (see infra/docker-compose.yml).
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
COPY services/api/pyproject.toml services/api/pyproject.toml
COPY services/worker/pyproject.toml services/worker/pyproject.toml
RUN uv sync --frozen --no-dev --group test --package lumacut-worker --no-install-workspace

COPY packages/schema/py packages/schema/py
COPY services/worker services/worker
RUN uv sync --frozen --no-dev --group test --package lumacut-worker

CMD ["python", "-m", "lumacut_worker.main"]
