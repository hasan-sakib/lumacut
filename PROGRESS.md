# PROGRESS — Lumacut v1

## Status
| # | Milestone | State | Date |
|---|---|---|---|
| M0 | Scaffold: monorepo, Docker Compose, schema + JSON Schema + Pydantic gen, `make check`, sample media | done | 2026-11-01 |
| M1 | Media pipeline + auth + asset library UI | not started | — |
| M2 | Engine core: decode, cache, composite, nested comps, audio sync, frame-accurate seek | not started | — |
| M3 | Action Registry + ops + palette + Pro timeline + inspector + undo/redo + autosave | not started | — |
| M4a | Keyframes + graph editor + color pipeline + scopes + LUTs + effect system (~10 effects) | not started | — |
| M4b | Text + captions editing + all transitions | not started | — |
| M4c | Remaining effects (40 total) | not started | — |
| M5 | Motion graphics: shapes/pen, masks, mattes, text animators, precompose, presets, motion blur, paths | not started | — |
| M6 | Photo workspace | not started | — |
| M7 | Audio: mixer, effects, keyframed volume, pitch-preserving speed, loudness | not started | — |
| M8 | Export: video (browser + server), image, GIF, audio + parity test | not started | — |
| M9 | Simple mode + 20 templates + effect/preset browser + workspaces + onboarding + tooltips + inspector search | not started | — |
| M10 | AI analysis pipeline | not started | — |
| M11 | AI tools (SPEC §10.2) with preview/apply UI | not started | — |
| M12 | Auto-edit agent + Ask | not started | — |
| M13 | Hardening | not started | — |

## Current focus
M0 is done (2026-11-01). Next step: plan M1 (media pipeline + auth + asset library UI) and wait for approval.

Getting started in a new session:
- Start Docker Desktop, then `make install` (pnpm via corepack + `uv sync`) and `make up`.
- Run `make check` (hermetic), `make test-stack` (integration + e2e, needs the stack), `make samples` and `make test-samples`.
- The Makefile and scripts unset `VIRTUAL_ENV`, so a virtualenv from another project in your shell is ignored. When calling `uv run` by hand, `unset VIRTUAL_ENV` first.
- The full pre-M0 review (ambiguities #1–38, risks, version checks) is in `docs/pre-m0-review.md`.

## Decisions
**2026-11-01 — owner accepted every default in the pre-M0 review** (`docs/pre-m0-review.md`):
- Ops and schema additions (#1, #2, #6, #7, #10).
- Inline paint strokes (#9).
- Rational fps and CFR proxies (#4).
- 720p proxies; perf measured on a 1080p comp output (#14).
- An export master (≤1080p CFR H.264) used by both export paths (#15).
- Server export uses Playwright `channel: "chrome"` with `--enable-unsafe-swiftshader` (#16, #17).
- Determinism means bit-exact per backend, tolerances across backends (#18).
- Goldens run in Vitest browser mode (#19).
- Bundled OFL fonts only (#20).
- signalsmith-stretch for pitch-preserving speed (#22).
- AAC encode probe with the `@mediabunny/aac-encoder` fallback (#23).
- Tiled full-res photo export (#24).
- Linear Rec.709 working space (#25).
- Ask tool calls execute client-side (#27).
- Python validates and applies ops through a Node CLI from `packages/ops`; migrations live in TS only (#13, #28).
- Music comes only from user assets (#29).
- License spike before M11 (#30).
- AI subject select in M11 (#31).
- M4 split into M4a/b/c (#33).
- M9 accepted with typed captions plus a manual usability run (#34).
- Test media (#35): LibriSpeech for M10. The owner supplies the talking-head clip and the Anthropic key for M12.
- `make soak` for the 1 h leak test (#36).
- Email/password + JWT behind an AuthProvider (#37).
- Whole-document PUT with a version number (#38).

**2026-11-01 — M0 tooling**
- **JS:** pnpm 10.34.9 via corepack. pnpm 11/12 ship a native-binary layout the installed corepack 0.34 cannot run, and Node 25+ no longer bundles corepack (the web image installs pnpm with npm).
- **TypeScript 6.0.3, not 7.0:** typescript-eslint supports only TS <6.1 until TS 7.1 ships a stable API. Revisit then.
- **Other JS:** React 19.3, Vite 8.3, Vitest 5 (projects mode, v8 coverage), Zod 4.6, Tailwind 4.3, ESLint 10 flat config (strictTypeChecked + stylisticTypeChecked + react-hooks, named exports enforced), Prettier (printWidth 100).
- **Running TS scripts:** Node's native type stripping (`erasableSyntaxOnly`), so no tsx dependency. Packages are consumed source-first (`exports` → `src/index.ts`).
- **Python:** 3.12 in one uv workspace (root `pyproject.toml`, one `uv.lock`, one `.venv`). Members: `packages/schema/py` (lumacut-schema), `services/api`, `services/worker`. Tooling: ruff, mypy --strict with the pydantic plugin, pytest with warnings as errors and `--import-mode=importlib`.
- **Python driver and test-client choices:** asyncpg instead of psycopg (LGPL). httpx2 instead of httpx for the FastAPI/Starlette TestClient (Starlette 1.10 deprecates httpx; httpx2 is the BSD-3 successor from the Pydantic org).
- **Infra:** Postgres 18, Valkey 9.1, SeaweedFS 4.51 (S3 gateway; dev credentials in `infra/seaweedfs/s3.json`). Host ports are non-default (15432, 16379, 18333, 8000, 8080) and overridable via `infra/.env` (see `infra/.env.example`).
- **Codegen pipeline:** Zod registry → `z.toJSONSchema` (draft 2020-12) → one bundle with named `$defs`, plus a `discriminator` hint on discriminated unions → datamodel-code-generator. Options:
  - Pydantic v2, `extra=forbid`;
  - strict str/int/float/bool, matching Zod (no bool-as-number, no numeric strings);
  - `type` aliases for unions (`Op`, `Mask`, …);
  - Pydantic's **MISSING sentinel** for optional fields, so "absent" and "null" stay distinct exactly as in Zod.

  Python must validate from JSON (`parse_project_json` / `parse_op_json`) so arrays map to tuples. Models are generated inside the package dir (repo ruff config applies) and then moved, which keeps the drift check byte-stable.
- **`make check` is hermetic:** lint, format check, tsc, mypy, Vitest with coverage (gate: ≥95% lines on `packages/schema`), pytest unit and parity tests, schema drift. Stack-dependent tests are pytest markers `integration` (`make test-stack`) and `samples` (`make test-samples`). Nothing skips silently.
- **Cross-origin isolation (COOP/COEP) is on from M0** in both `vite dev` and `vite preview` (review #21 said M1). The API is reached through the same-origin `/api` proxy.
- **API container health means full readiness:** database, queue, storage and a registered worker. `make up` (`--wait`) returns only when the whole stack works.
- **Sample media:**
  - Generated in the worker image with bit-exact, single-threaded encodes, so files are byte-reproducible (sha256 in `manifest.json`).
  - Frame count = ceil(fps × duration).
  - The frame-number barcode layout (`services/worker/lumacut_worker/samples/barcode.py`) is a contract with M2's seek test.

**2026-11-01 — schema representation choices** (`packages/schema`)
- **Units and conventions:**
  - Times are integer µs (`TimeUs` ≥ 0, `DeltaUs` signed).
  - `Color` is `{r,g,b,a}` with 0–1 floats, sRGB-encoded, straight alpha.
  - `tracks[0]` is the bottom track.
  - Transform x/y are composition pixels (top-left origin), anchor is in layer pixels, scale 1 = 100%, rotation and skew are in degrees clockwise.
  - Crop is a 0–1 fraction per edge.
  - Every grading scalar and every lift/gamma/gain/offset `[r,g,b]` wheel is neutral at 0.
  - Curves are control-point arrays.
  - HSL uses 8 fixed bands.
  - Clip `audio.volume` is linear gain (0–4).
  - Text tracking is in 1/1000 em.
  - Trim paths and text range selectors use 0–1 fractions.
- **Ids and keyframes:**
  - `Id` matches `[A-Za-z0-9_-]{1,64}` (no dots), so ids work as property-path segments.
  - Keyframe paths address collection items by id (`effects.<id>.params.radius`).
  - Grouped virtual paths `transform.position` / `transform.scale` take Vec2 values, so motion paths can have spatial tangents.
  - Keyframe `tUs` is relative to the clip's `startUs`.
- **Metadata:** timestamps are `IsoUtcDateTime` strings (metadata only, never used for rendering). The project `Asset` holds only what editing needs; storage, proxies and status live in the backend asset record.
- **Schema is structural only.** Cross-reference and overlap invariants belong to `applyOp` (M3), which keeps TS↔Python parity exact.

## Deviations from spec
- **SeaweedFS (Apache-2.0) instead of MinIO.** MinIO is AGPL, and its community edition stopped shipping images and is unmaintained. Code uses only the S3 API.
- **Valkey (BSD-3) instead of Redis.** Redis 8 is RSAL/SSPL/AGPL. RQ and redis-py work unchanged.
- **React 19.3 instead of React 18** (owner-approved).
- **Schema extensions beyond SPEC §4:**
  - `Composition.fps` is a rational `{num, den}`.
  - New `Clip` fields: `reversed`, `freezeAtUs`, `linkId`, `caption {words[], styleId}`.
  - `paint: { strokes[] }` stored inline, replacing `strokesAssetId`.
  - `Mask` is a union of `path | raster`.
  - `KeyframeValue` also allows `BezierPath`.
  - `TransitionInstance.alignment`.
  - Stable `id` on shape items and text animators.
  - New types the spec leaves undefined: `Asset`, `Marker`, `AiRunRecord`, `PlaceholderInfo`.
- **Ops added to the SPEC §4 list (14):** `updateComposition, removeComposition, updateAsset, removeAsset, addMarker, updateMarker, removeMarker, setTrackProps, linkClips, unlinkClips, setPlaceholder, removeMask, addPaintStrokes, removePaintStrokes`. A test asserts the catalogue equals the spec list plus exactly these.
- **`docs/` folder added**, holding the pre-M0 review.

## Known gaps
- **Op payload shapes are provisional until M3** implements `applyOp`. `schemaVersion` stays 1 until projects are first persisted (M3); after that, every breaking schema change needs a migration in `packages/schema/src/migrations.ts`.
- **Schemas not yet defined:** `Analysis` and `EditPlan` (M10), and the effect/transition definition schema (M4a).
- **No OpenAPI → TS client generation yet.** The only endpoint is `GET /api/health`, whose client types are hand-written in `apps/web/src/api/health.ts`. Generation arrives in M1 with the first real endpoints.
- **Not created yet:** `packages/ops`, `engine`, `effects`, `actions`, `ui-kit` and `apps/render-page`. Each arrives in its milestone (no empty stubs).
- **No auth, users or assets tables:** Alembic is configured but has zero revisions (M1).
- **No CI pipeline** (no git remote). Checks run locally via `make check` / `make test-stack` / `make test-samples`.
- **Engine determinism lint rules** (`Date.now`, `Math.random` banned in render paths) are added with the engine in M2.
- **Dev-only infra:** the web container serves the build with `vite preview`, images aren't hardened, and credentials are dev placeholders. A production deployment setup is outside v1 M0 scope.
- **No speech or talking-head samples.** M10/M12 need licensed real footage (review #35).
- **Python dev-stub packages** (`types-aiobotocore*`, `botocore-stubs`) must only be imported under `TYPE_CHECKING`; they aren't installed in images.

## Dependencies & licenses
**npm (direct)**
| Package | Version | License | Where |
|---|---|---|---|
| react, react-dom | 19.3.1 | MIT | apps/web |
| zod | 4.6.7 | MIT | packages/schema |
| vite | 8.3.5 | MIT | apps/web (dev) |
| @vitejs/plugin-react | 6.1.2 | MIT | apps/web (dev) |
| tailwindcss, @tailwindcss/vite | 4.3.3 | MIT | apps/web (dev) |
| @playwright/test | 1.64.1 | Apache-2.0 | apps/web (dev); Chromium headless shell 156 downloaded to `~/Library/Caches/ms-playwright` |
| @testing-library/react / dom | 16.3.3 / 10.4.2 | MIT | apps/web (dev) |
| jsdom | 30.1.3 | MIT | apps/web (dev) |
| @types/react, @types/react-dom | 19.3.0 | MIT | apps/web (dev) |
| fast-check | 4.10.2 | MIT | packages/schema (dev) |
| typescript | 6.0.3 | Apache-2.0 | root (dev) |
| vitest, @vitest/coverage-v8 | 5.0.5 | MIT | root (dev) |
| eslint, @eslint/js | 10.14.0 / 10.0.1 | MIT | root (dev) |
| typescript-eslint | 8.72.1 | MIT | root (dev) |
| eslint-plugin-react-hooks | 7.1.1 | MIT | root (dev) |
| eslint-config-prettier | 10.1.8 | MIT | root (dev) |
| globals | 17.14.0 | MIT | root (dev) |
| prettier | 3.9.10 | MIT | root (dev) |
| @types/node | 26.6.6 | MIT | root (dev) |
| pnpm (package manager) | 10.34.9 | MIT | tooling |

**Python (direct)**
| Package | Version | License | Where |
|---|---|---|---|
| pydantic | 2.14.2 | MIT | lumacut-schema, api, worker |
| fastapi | 0.162.0 | MIT | api |
| uvicorn[standard] | 0.54.0 | BSD-3-Clause | api |
| pydantic-settings | 2.16.2 | MIT | api, worker |
| sqlalchemy[asyncio] | 2.1.6 | MIT | api |
| asyncpg | 0.32.0 | Apache-2.0 | api |
| alembic | 1.20.1 | MIT | api |
| redis | 8.1.0 | MIT | api, worker (client library; the server is Valkey) |
| rq | 3.0.0 | BSD-2-Clause | api, worker |
| aiobotocore (+ botocore) | 3.10.0 | Apache-2.0 | api |
| structlog | 26.1.0 | MIT OR Apache-2.0 | api, worker |
| datamodel-code-generator | 0.87.0 | MIT | dev (codegen) |
| ruff | 0.17.3 | MIT | dev |
| mypy | 2.4.1 | MIT | dev |
| pytest / pytest-asyncio | 9.2.0 / 1.4.1 | MIT / Apache-2.0 | dev; also the worker image `test` group |
| httpx2 | 2.16.0 | BSD-3-Clause | dev (TestClient, integration tests) |
| types-aiobotocore, types-aiobotocore-s3, botocore-stubs | 3.10.0 / 3.10.0 / 1.43.123 | MIT | dev (type stubs) |
| uv_build | 0.10.x | MIT OR Apache-2.0 | build backend |

**Docker images and system packages**
| Component | Version | License | Notes |
|---|---|---|---|
| postgres | 18 | PostgreSQL License | |
| valkey/valkey | 9.1 | BSD-3-Clause | replaces Redis |
| chrislusf/seaweedfs | 4.51 | Apache-2.0 | replaces MinIO |
| python | 3.12-slim-trixie | PSF | api/worker base |
| node | 26-trixie-slim | MIT | web base |
| ghcr.io/astral-sh/uv | 0.10.7 | MIT OR Apache-2.0 | copied into images |
| FFmpeg (Debian trixie) | 7.1.5 | GPL-2.0+ build (libx264, libx265) | Server-side only, never distributed to clients. Distributing images triggers GPL obligations, and H.264/HEVC/AAC patent licensing is a business question (review §4). |
| fonts-dejavu-core | Debian | Bitstream Vera / public-domain derived (free) | drawtext in sample media only |

**AI models:** none added yet. Candidate licenses are recorded in `docs/pre-m0-review.md` §4. BRIA RMBG is excluded (non-commercial), and LaMa/BiRefNet weights need confirmation before M11.
