# Build context: repository root (see infra/docker-compose.yml).
FROM python:3.12-slim-trixie

COPY --from=ghcr.io/astral-sh/uv:0.10.7 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH=/opt/venv/bin:$PATH \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Dependencies first (cached until the lockfile changes).
COPY pyproject.toml uv.lock .python-version ./
COPY packages/schema/py/pyproject.toml packages/schema/py/pyproject.toml
COPY services/api/pyproject.toml services/api/pyproject.toml
COPY services/worker/pyproject.toml services/worker/pyproject.toml
RUN uv sync --frozen --no-dev --package lumacut-api --no-install-workspace

COPY packages/schema/py packages/schema/py
COPY services/api services/api
RUN uv sync --frozen --no-dev --package lumacut-api

WORKDIR /app/services/api
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn --factory lumacut_api.main:app_factory --host 0.0.0.0 --port 8000"]
