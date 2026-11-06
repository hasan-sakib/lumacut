# Lumacut developer commands. Requires: Node >= 24 (corepack), uv, Docker (for stack targets).
# Note: macOS ships GNU make 3.81, so this file avoids make 4 features.

SHELL := /bin/bash
# uv must use the repo .venv even if another virtualenv is active in the caller's shell.
unexport VIRTUAL_ENV
COMPOSE := docker compose -f infra/docker-compose.yml
PY_TEST_UNIT := -m "not integration and not samples"

.PHONY: install gen-schema gen-openapi check lint format-check format typecheck test \
        schema-drift openapi-drift \
        up down logs test-stack e2e samples test-samples fixtures perf-media smoke-render perf test-engine

## Setup ----------------------------------------------------------------------
install:
	pnpm install --frozen-lockfile
	uv sync --all-packages --frozen

## Schema (packages/schema is the source of truth) ----------------------------
gen-schema:
	scripts/gen-schema.sh

schema-drift:
	scripts/check-schema-drift.sh

## API contract (FastAPI OpenAPI -> TS types for apps/web) ----------------------
gen-openapi:
	scripts/gen-openapi.sh

openapi-drift:
	scripts/check-openapi-drift.sh

## Hermetic checks: no Docker needed -------------------------------------------
check: lint format-check typecheck test schema-drift openapi-drift
	@echo "make check: all green"

lint:
	pnpm exec eslint --max-warnings 0 .
	uv run ruff check .

format-check:
	pnpm exec prettier --check .
	uv run ruff format --check .

format:
	pnpm exec prettier --write .
	uv run ruff format .

typecheck:
	pnpm exec tsc -p tsconfig.json
	pnpm -r --if-present typecheck
	uv run mypy

test:
	pnpm exec vitest run --coverage
	uv run pytest $(PY_TEST_UNIT)

## Docker stack ------------------------------------------------------------------
up:
	$(COMPOSE) up -d --build --wait

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f --tail=100

# Integration tests + e2e against the running stack (sample media is generated if missing).
test-stack: up
	@test -f samples/generated/manifest.json || $(MAKE) samples
	cd services/api && uv run alembic check
	uv run pytest -m integration
	pnpm test:e2e

e2e:
	pnpm test:e2e

## Sample media (generated inside the worker image, which ships ffmpeg) ---------
# The live worker source is mounted over the (editable) installed copy, so no rebuild is needed.
WORKER_RUN := $(COMPOSE) run --rm --no-deps -v $(CURDIR)/services/worker:/app/services/worker \
  -v $(CURDIR)/packages/engine/fixtures:/engine-fixtures:ro worker

samples:
	mkdir -p samples/generated
	$(WORKER_RUN) python -m lumacut_worker.samples /samples

test-samples:
	$(WORKER_RUN) python -m pytest -m samples -n 3 --dist loadgroup /app/services/worker/tests/samples

# Real M1 renditions of the 1080p samples for `make perf` (samples/generated/perf).
perf-media:
	@test -f samples/generated/manifest.json || $(MAKE) samples
	$(WORKER_RUN) python -m lumacut_worker.samples --perf-media /samples

# The engine's Node + real-browser (Chromium, WebGL2, WebCodecs, Web Audio) tests. Also part of `make check`.
test-engine:
	pnpm exec vitest run --project engine --project engine-browser

# Headless render of real renditions on both WebGL backends + cross-backend comparison (M2).
smoke-render:
	pnpm --filter @lumacut/render-page smoke

# M2 playback gate in installed Chrome on this machine's GPU (needs `make perf-media` once).
perf:
	@test -f samples/generated/perf/perf-media.json || $(MAKE) perf-media
	pnpm --filter @lumacut/render-page perf

# Small committed fixtures for the engine's browser tests (packages/engine/fixtures).
fixtures:
	$(COMPOSE) run --rm --no-deps -v $(CURDIR)/services/worker:/app/services/worker \
	  -v $(CURDIR)/packages/engine/fixtures:/fixtures worker \
	  python -m lumacut_worker.samples --fixtures /fixtures
