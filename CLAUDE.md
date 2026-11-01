# CLAUDE.md — Lumacut

Web creative studio: video editing + motion graphics + photo editing + AI auto-editing.
**Read `SPEC.md` before any work. `PROGRESS.md` tracks state.**

## Every session
- Start by reading PROGRESS.md (Current focus, Known gaps) and the relevant SPEC.md sections before doing anything.
- End by updating PROGRESS.md so the next session can continue without extra context.

## How to work
- One milestone (SPEC §13) at a time. Start each one with a plan (files, approach, risks, how each acceptance criterion will be verified) and wait for approval.
- A milestone is done only when its acceptance criteria pass and `make check` is green. Then update PROGRESS.md (status, decisions, deviations, known gaps, new dependencies + licenses) and commit `feat(Mx): ...`.
- Spec ambiguous or infeasible → stop and ask. Never silently simplify, stub, or fake data.
- For a bug: write a failing test first, then fix.

## Architecture rules (never violate)
1. `packages/schema` is the source of truth. Python models are generated (`make gen-schema`); never hand-edit them.
2. Every project change goes through `packages/ops`. No direct mutation of the project document.
3. Every user-facing feature is an Action in `packages/actions` (title, description, keywords, `when`, args schema). Menus, toolbar, palette, shortcuts, context menus, and the AI all come from the registry. Never hard-code a feature into one UI surface only.
4. Video, motion, and photo are all compositions rendered by one engine. Do not create separate renderers for photo or export.
5. Time is integer microseconds everywhere.
6. Rendering is deterministic: no `Date.now()`, no unseeded randomness in render paths.
7. Always `close()` VideoFrame/AudioData; respect cache memory budgets.
8. Effects are definitions in `packages/effects` (param schema + GLSL + golden test); their UI is auto-generated from the param schema.
9. Every keyframeable property uses the same keyframe system and the same ◆ UI control.
10. AI never mutates projects directly: it returns ops (or a new asset + ops) for user approval. LLMs decide *what*; deterministic code computes timings and keyframes.
11. AI models and dependencies must be commercially usable (no AGPL / non-commercial). Record licenses in PROGRESS.md.

## Commands
- `docker compose -f infra/docker-compose.yml up -d` (stack) · `pnpm dev` (web)
- `make check` (lint, typecheck, all tests). Run it before claiming anything works.
- `make gen-schema` · `make samples` · `pnpm test:e2e`

## Conventions
- TS strict, ESLint + Prettier, Vitest, named exports, function components, Zustand stores in `apps/web/src/stores`.
- Python 3.11+, ruff, mypy --strict, pytest, Pydantic v2, async FastAPI.
- Shaders in `packages/effects/<effect>/*.glsl`; LLM prompts in `services/worker/ai/prompts/` (versioned files).
- UI: every icon button has a tooltip (name, description, shortcut) and an ARIA label.
