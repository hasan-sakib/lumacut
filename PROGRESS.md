# PROGRESS — Lumacut v1

## Status
| # | Milestone | State | Date |
|---|---|---|---|
| M0 | Scaffold: monorepo, Docker Compose, schema + JSON Schema + Pydantic gen, `make check`, sample media | done | 2026-11-01 |
| M1 | Media pipeline + auth + asset library UI | done | 2026-11-01 |
| M2 | Engine core: decode, cache, composite, nested comps, audio sync, frame-accurate seek | done, verified 2026-11-07 (`make check`, engine browser tests, `make smoke-render`, `make perf` on GPU) | 2026-11-07 |
| M3a | Ops engine (`packages/ops`), projects API + autosave + undo/redo, Action Registry upgrades + command palette | done, verified 2026-11-07 (`make check`, `make test-stack`; acceptance e2e passes) | 2026-11-07 |
| M3b-1 | Editor page: preview + playback, Pro timeline (zoom/scroll, move/trim, snapping, razor, ripple/roll/slip/slide, markers, track headers) | done, verified 2026-11-07 | 2026-11-07 |
| M3b-2 | Inspector, clip thumbnails + waveforms, clip context menu, copy/paste, acceptance e2e (5-clip edit by palette, then by mouse; reload identical) | done, verified 2026-11-07 | 2026-11-07 |
| M4 | Keyframes + graph editor + transitions + text + captions + colour pipeline + scopes + LUTs + effect system (40 effects) | **built 2026-11-07, not verified**: no tests, goldens, e2e or `make check` were run at the owner's request (tests come after all milestones); only `tsc` and `eslint` | 2026-11-07 |
| M5 | Motion graphics: shapes/pen, masks, mattes, text animators, precompose, presets, motion blur, paths | **built 2026-11-08, not verified**: no tests, goldens, e2e or `make check` were run at the owner's request; only `tsc` and `eslint` | 2026-11-08 |
| M6 | Photo workspace: canvas, layers panel, adjustment layers, crop/straighten, selections→masks, brush/eraser, image export, large images | **built 2026-11-08, not verified**: no tests, goldens, e2e or `make check` were run at the owner's request; only `tsc`, `eslint` and `prettier` (plus `ruff` and `make gen-openapi` for the API change) | 2026-11-08 |
| M7 | Audio: mixer, effects, keyframed volume, pitch-preserving speed, loudness | not started | — |
| M8 | Export: video (browser + server), image, GIF, audio + parity test | not started | — |
| M9 | Simple mode + 20 templates + effect/preset browser + workspaces + onboarding + tooltips + inspector search | not started | — |
| M10 | AI analysis pipeline | not started | — |
| M11 | AI tools (SPEC §10.2) with preview/apply UI | not started | — |
| M12 | Auto-edit agent + Ask | not started | — |
| M13 | Hardening | not started | — |

## Current focus
**M6 is built as one milestone (2026-11-08) and has never been tested** (same arrangement as M4 and M5: features first, tests after all milestones; `tsc` on every package, `eslint --max-warnings 0`, `prettier --check`, `ruff` on the API: all clean; nothing is committed). Docs: `docs/photo.md` (also `docs/masks.md`).

**What to test for M6** (add to the verification pass below):
1. **Engine `view` equivalence** (the riskiest change, it touches every render): a windowed/scaled render equals the crop/resize of the full render within tolerance, for plain layers, effects (blur/glow at the window edge), masks, mattes, transitions, adjustment layers, nested compositions; a render with no `view` is bit-identical to before (re-run the M2 goldens / `make smoke-render` / `make perf`). Export tiles (`planTiles`: exact cover, margin, seams) stitched equal one full render.
2. **Paint:** stamp spacing/pressure/hardness maths (`paint/stamp.ts`), incremental raster equals a full redraw, eraser, opacity-per-stroke, `paintExtent`/`paintResolution` limits, texture cache keys after undo.
3. **Bitmap masks:** alpha compositing with mode/opacity/invert/feather, `setMaskOverride` precedence, the mask-brush save flow (upload → ready → one batch, error path, override cleared), LRU close of mask bitmaps.
4. **Pure logic:** `photo/selection.ts` (shapes, lasso simplify, canvas→layer mapping, `selectionToMask` incl. rotated/scaled layers), `photo/canvas-ops.ts` (every edit + `transformUnder` round trips, flips, straighten inscribed rectangle, resize anchors), `photo/view.ts`, `photo/crop.ts` (`dragCrop` with aspect), `export/tiles.ts`, `photo/layers.ts`.
5. **Actions:** `paint.*`, `layer.*` (reorder semantics with several layers, duplicate, group/ungroup incl. removing emptied layers, `layer.moveTo`), `marquee.*`, `canvas.*` (blocked by animated layers), `export.*`, `project.newPhoto*`, view/tool actions; the API's sized photo document (`default_document`) and `POST /api/projects` with width/height/background.
6. **Acceptance e2e (SPEC §13 M6):** open a 6000 px photo with 5 layers (image, paint, adjustment, text, shape), pan/zoom/paint smoothly (frame time budget), export PNG and JPG and compare pixels to a full-resolution reference render; plus a `make perf` photo scenario.
7. Manual pass: every tool (marquee, lasso, crop + straighten, brush, eraser, mask brush), layer panel drag/reorder, zoom/pan (wheel, pinch, Space), export dialog, "Edit photo" from the library, undo of each.

**M5 is built as one milestone (2026-11-08) and has never been tested** (same arrangement as M4: features first, tests after all milestones; `tsc` on every package, `eslint --max-warnings 0` and `prettier --check` are clean; nothing is committed). Docs: `docs/shapes.md`, `docs/masks.md`, `docs/presets.md`.

**What to test for M5** (add to the verification pass below):
1. **GPU compile** of `mask.frag.glsl`, `matte.frag.glsl`, `accumulate.frag.glsl` (never compiled; a failure shows as `render_error` on the clip).
2. Golden / pixel tests: shapes (fill, stroke, dash, trim, round corners, each item kind), masks (add/subtract/intersect, feather, expansion, invert, opacity), mattes (4 modes, hidden matte clip), motion blur (sample accumulation; a static clip draws once), text animator coverage curves and unit selection (char/word/line), precompose + nested draw.
3. Unit tests: keyframe paths (`paths-motion.ts`: masks, shape, animators, motionBlur) incl. `removeMask`/`removeItem` cleaning keyframes; every preset's keyframe shape, window and idempotence (`setFrames`); seeded shake/glitch determinism; overlay geometry (`viewport`, `layer-box`, `gizmo`, `path-edit`, `pen`, `motion-path`, `transform-ops`); inspector builders (`synthetic`, `shapes`, `masks`, `animators`); the `shape.*`, `mask.*`, `matte.*`, `text.*Animator`, `clip.precompose`, `composition.*`, `tool.*`, `preset.apply`, `motion.blur` actions.
4. **Acceptance e2e (SPEC §13 M5):** build an animated lower-third from scratch (rounded-rect shape bar + two text clips, a slide-in preset, edit one keyframe in the graph editor, reload identical); a preset applies editable keyframes.
5. Manual pass: drawing tools and pen (click, drag tangents, close), path editing, transform gizmo, motion path handles, breadcrumb navigation, Presets tab.

**M4 is built as one milestone (2026-11-07) and has never been tested.** The owner asked for features first and all tests later ("finish all the milestones first"), so for M4 only `tsc` (every package) and `eslint` were run: both clean. Nothing is committed (the owner commits). M2 and M3 are verified (record below).

**The first thing to do when testing M4** (in this order):
1. `make check`. Known to need work: `packages/ops` coverage is above its gate but the new `setTransition` rules (`not_adjacent`, window fit) have **no tests** and will probably break the existing `setTransition` tests in `packages/ops/test/editing.test.ts` (they may add a transition with no touching clip); `packages/effects` has no tests; the engine and web have no tests for effects, transitions, text, captions, scopes UI wiring, or the LUT library flow. Several earlier M4 pieces *do* have tests (keyframe maths, presets, graph editor, colour reference + shader, scope maths, `.cube` parser); see below.
2. `make test-engine`: **54 GLSL shaders (40 effects, 14 transitions) plus the source/colour/solid/adjustment/text paths have never been compiled by a GPU.** A broken shader shows up as a `render_error` diagnostic on the clip using it. Expect typos.
3. Golden tests (SPEC acceptance: "golden tests for every effect/transition"): a procedural still-image test card through every effect (default + one non-default parameter set) and every transition at progress 0 / 0.5 / 1; plus an independent check per effect (see Known gaps → M4). `make golden-update` doesn't exist yet.
4. `make test-stack` (the `.cube` integration tests in `services/api/tests/integration/test_luts.py` need the worker image rebuilt), then e2e for the M4 acceptance (animate by ◆ + graph ease, reload identical; add effect / transition / text / caption by palette only and by mouse only), then `make perf` with the SPEC §6 scenario that M4 can draw (3 video tracks + 2 text layers + colour + 2 effects at 1080p).
5. Manual pass: ◆ on every field, graph editor drags, colour wheels/curves, effects browser, transitions on a real cut, caption import.

Verified earlier in this milestone (these have tests, and passed when written): `packages/ops` keyframe evaluation (linear/hold/AE-bezier, spatial paths, colour, shapes), property paths and validation, splitting mid-animation, ease presets; inspector ◆ logic and components; graph editor model + component; colour shader vs the TS reference (16 settings combinations + LUT files through the resolver + geometry); scope maths + engine scope readback + Scopes panel; `.cube` parser (TS + Python); LUT assets in the API unit tests.

**Verification record, M2 + M3 (2026-11-07)**: `make check` green; `make test-engine` and `make smoke-render` green; `make perf` on the GPU (Apple M2, Metal via installed Chrome) passed every gate (60.0 fps, p95 render 4.0 ms, 0% frames never shown, frames opened = closed, 0.47 MB memory growth over 20 s + 2000 seeks; SwiftShader floor 8.2 fps); `make test-stack`: integration 26 passed / 1 skipped, e2e 16 of 18 on a loaded machine and the 2 failures (`player.spec.ts`, `resume.spec.ts`) passed alone with `--workers=1` (CPU contention; run with `--workers=2` or on a quiet machine); the M3 acceptance e2e passed. Not run: `make test-samples` (~25 min, M1 pipeline) and a manual browser pass. Cross-backend finding: the compositor is bit-identical on SwiftShader and the GPU for stills; video differs only through the decoder (SSIM ≈ 0.998), so golden images must use still-image inputs.

Next: **M7** (audio: mixer, effects, keyframed volume, pitch-preserving speed, loudness). Plan it and wait for approval; the owner wants M7 and later built whole, not split.

Getting started in a new session:
- Start Docker Desktop, then `make install` (pnpm via corepack + `uv sync`) and `make up`.
- Run `make check` (hermetic), `make test-stack` (integration + e2e, needs the stack), `make samples` and `make test-samples` (pipeline on every sample; ~10+ min, runs 3 workers in the worker image).
- After changing API routes or models: `make gen-openapi` (TS types for the web app). After changing `packages/schema`: `make gen-schema`. Both are drift-checked in `make check`.
- First run of e2e on a new machine: `pnpm --filter @lumacut/web exec playwright install chromium`.
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
- M4 was first planned as M4a/b/c (#33); the owner later asked for it as one milestone, and M5+ are not to be split either.
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

**2026-11-01 — M1 (media pipeline, auth, asset library)**
- **Shared Python package `services/core` (`lumacut_core`):** settings, logging, ids, DB models (SQLAlchemy 2 async), storage helpers (S3 client, key layout, presign, streaming multipart `upload_file`), the asset state event and `CamelModel` (snake_case in Python, camelCase on the wire). The API owns migrations (`services/api/alembic`); `make test-stack` runs `alembic check`.
- **Owner choices:** a minimal Action Registry now (`packages/actions`); images over 8192 px are downscaled in the normalized copy, the original is kept, and the UI shows "Downscaled from W×H".
- **Auth:**
  - `AuthProvider` protocol with `PasswordAuthProvider` (argon2id, timing-equalized for unknown emails).
  - HS256 access JWT, 15 min, held in memory.
  - Opaque refresh token rotated on every use, stored as a sha256, sent as an httpOnly `SameSite=Strict` cookie on `/api/auth`. Reusing a rotated token revokes the whole family.
  - `LUMACUT_JWT_SECRET` must be ≥32 bytes, and the dev default is refused unless `LUMACUT_ENV=dev`.
- **API conventions:**
  - Every error is `{"error": {"code", "message", "fields"?}}`, and the OpenAPI document describes 422s with that shape.
  - Mutating routes `commit()` explicitly before returning, so commits never race the response. Models use `eager_defaults`.
  - Other users' assets return 404.
- **Uploads:**
  - Browser → presigned multipart directly to SeaweedFS, 16 MiB parts (`LUMACUT_UPLOAD_PART_SIZE_BYTES`), 20 GiB maximum.
  - Storage is the source of truth (ListParts), so `complete` verifies every part is present and the sizes add up.
  - Presigned URLs use `LUMACUT_S3_PUBLIC_ENDPOINT_URL`, because the signature covers the host.
  - SeaweedFS already reflects the request origin and exposes `ETag` for CORS.
- **Resume after refresh:** IndexedDB (idb-keyval) stores {assetId, name, size, lastModified, FileSystemFileHandle?}. Resume re-requests permission on the stored handle (Chrome/Edge native picker or drag-and-drop), otherwise asks the user to re-pick the file (size checked). Only missing parts are sent.
- **Worker job (`lumacut_worker.jobs.media`):**
  - Runs async code under `asyncio.run` (asyncpg + aiobotocore). The pipeline runs in a thread.
  - Progress is throttled to 0.5 s and written to the DB row, then published on `lumacut:user:{id}:assets`.
  - An RQ `on_failure` callback marks crashes and timeouts as failed.
  - The RQ timeout is 15 min + 2 s/MiB of file size, because duration isn't known before the probe.
- **Pipeline (`lumacut_worker.pipeline`, pure functions on local files):**
  - **Frame rate:** the CFR rate is the stream's `r_frame_rate` when that is a standard rate (within 0.5%), which keeps phone VFR footage on its real 30 fps grid. Otherwise the average is snapped to the nearest of 23.976–60, capped at 60.
  - **Proxy:** fits 1280×720 (portrait 720×1280), no upscaling, H.264 CRF 23, closed GOP `ceil(fps/2)`, BT.709 tags, AAC 48 kHz stereo, `+faststart`. Audio-only files get an AAC `.m4a`.
  - **Master:** ≤1080p, CRF 18, 1 s GOP, AAC 256k. Audio-only files get FLAC 48 kHz.
  - **Thumbnails:** a 480 px poster, plus sprite sheets (10×10 tiles, 90 px high, ≤200 tiles; tile i = first frame at or after i × interval) and `thumbs/index.json`.
  - **Waveform:** audiowaveform JSON v2 at 100 peaks/s, computed from the proxy audio with numpy in chunks.
  - **Images (Pillow):** EXIF orientation, ICC → sRGB, 16-bit greyscale scaled (not clipped), PNG when there is alpha else JPEG q95 4:4:4, `preview.webp` ≤2048, `thumb.webp` ≤480. Animated formats use their first frame.
  - **Damaged files:** a source that transcodes shorter than its probed duration is reported as `corrupt_file` ("The file is damaged or incomplete…").
- **SSE (`GET /api/events`, sse-starlette):**
  - Authenticates with a short-lived DB session, so a stream never pins a pool connection.
  - Subscribes before reading the snapshot of unfinished assets, so no update can slip between them.
  - Events carry full state. The web client reads the stream over `fetch` (Bearer header) and reloads the list after a reconnect.
- **API contract:** `scripts/gen-openapi.sh` exports FastAPI's OpenAPI document without a server, then openapi-typescript generates `apps/web/src/api/generated/schema.d.ts`. The web app uses openapi-fetch with single-flight refresh-and-retry on 401.
- **Web:**
  - react-router 8, zustand stores (`auth`, `assets`, `uploads`, `ui`) and radix-ui (Tooltip, Dialog, DropdownMenu).
  - Every library command is an Action rendered by `ActionButton` (tooltip with name, description and shortcut, plus ARIA label), with shortcuts dispatched from the registry.
  - Storage images are always `<img crossOrigin="anonymous">`, never CSS backgrounds, which COEP would block.
  - Posters and sprite frames keep their aspect inside 16:9 cards.
  - The stack status panel moved to the login page.
- **Tests:**
  - API integration tests are black-box over HTTP against the stack, with helpers in `services/api/tests/integration/api_testkit.py` on pytest's `pythonpath`.
  - Container sample tests run with pytest-xdist `-n 3 --dist loadgroup`, one sample per group. 8 workers oversubscribed the 8 GB Docker VM (33 min against 7.5 min serial).

**2026-11-02 — M2 spikes (run before building the engine; results the design rests on)**
- **Mediabunny 1.65 works inside a module Worker** and reads proxies by range request. In Chromium 156: 13 random seeks across GOP boundaries (0, 14/15/16, 137, 299, …) and a 40-frame sequential run all returned the exact frame (burned-in barcode == requested index) when asked at the **centre** of the frame interval. A 720×1280 proxy took 8–35 ms per random seek and ~3.5 ms per frame sequentially. 53 frames opened, 53 closed.
- **Cross-origin reads need bucket CORS.** SeaweedFS's default CORS response did not expose `Content-Range`, so a page could not learn the file size from a range response. The API now applies bucket CORS at startup (`LUMACUT_CORS_ALLOWED_ORIGINS`, default `http://localhost:8080,http://localhost:5173`; exposes ETag, Content-Range, Accept-Ranges, Content-Length, Content-Type, Last-Modified). Verified from a real page at `localhost:8080`: Mediabunny in a Worker decoded exact frames from a presigned URL, every storage response a `206`. The rule is live immediately (no cache delay seen). `test_storage_cors.py` pins it.
- **Origins are now pinned** (previously SeaweedFS reflected any origin), which also closes part of the M1 "production CORS" gap. Origins other than the two above (e.g. the Vitest browser server) cannot read stored media; engine tests therefore use same-origin fixtures.
- **Headless Chromium can run engine tests**: H.264/VP9/AV1/AAC decode, WebGL2 (SwiftShader, max texture 8192), AudioContext at 48 kHz with a running clock (headless `outputLatency` 0.168 s), `crossOriginIsolated`. Installed Chrome 156 uses the Apple M2 GPU (Metal, max texture 16384). `VideoDecoder` exists only in secure contexts, so `about:blank` probes are meaningless.
- **Vitest browser mode** needs `optimizeDeps.include: ["mediabunny"]` (otherwise Vite reloads the page mid-run) and `--autoplay-policy=no-user-gesture-required` for AudioContext.
- **`Content-Length` sums overstate transfer**: Mediabunny issues open-ended range requests and aborts them, so adding up response headers over-counts. Measure real transfer in `make perf` if it matters.

**2026-11-06 — M2 engine core: decisions**
- **Package `packages/engine`** (Mediabunny + WebCodecs decode, WebGL2 compositor, Web Audio). Same code runs in-thread (`Engine`, tests, render-page) and in a module Worker (`EngineClient`/`EngineHost`, RPC). `PlaybackSession` wires worker engine + `AudioEngine` + `PlaybackController` for any page.
- **Frame lookup at the centre of the frame interval plus `SAMPLE_BIAS_US = 2`** in the playback direction (reverse: −2). A test shows the naive mapping picks the wrong frame at 29.97 fps. The last 2 µs before a frame boundary belong to the next frame (known tolerance zone).
- **Working space is linear premultiplied RGBA16F**, sRGB in and out (50% red over black reads back as sRGB 188 by design). `normal` blends in fixed function; the other 23 schema blend modes use a ping-pong shader, with a TS reference (`compositePixel`) as the test oracle.
- **A layer's size is the asset's declared size** (`Asset.video/image` width/height), not the decoded rendition's: transforms are authored against the original while the engine reads a proxy of at most 720p. Found by reasoning about the real pipeline, fixed test-first (`declared-size.test.ts`). Nested compositions use their own size.
- **Nested compositions** render to RGBA16F cache textures keyed `(compId, structural hash, tUs)`; cycles (error names the path) and depth > 16 are rejected.
- **Nothing is dropped silently:** unsupported clip types and properties (see gaps) produce diagnostics in `RenderResult.diagnostics`, shown in the bench.
- **Playback:** the playhead is the audio clock (`getOutputTimestamp().contextTime`); first sound starts 0.08 s after `play()`. Latest-wins frame scheduler; a seek cancels any pending playback frame (mutation-checked). Events call RPC handlers; calls after dispose reject. `dispose()` returns the final `StatsSnapshot` so callers can assert every frame was closed.
- **Determinism:** ESLint bans `Date.now`, `Math.random`, `performance.now` and random crypto in `packages/engine/src/{timeline,math,blend,gl,decode,render}` (`eslint.determinism.ts`); timing is an injected `Clock`.
- **Test infrastructure:** 8 committed fixtures (1.4 MB, `packages/engine/fixtures`, made by the real M1 pipeline via `make fixtures`; `fx_long_gop` encoded directly; VFR fixture has 17 duplicated barcodes) with `manifest.json` ground truth; barcode contract shared with Python through `barcode-vectors.json`. Browser test files run serially (`fileParallelism: false`) because the live playback tests measure real time and fail when CPU-starved.
- **Bucket CORS** (see M2 spikes) is applied by the API at startup. Presigned URLs are cached 45 min by the web resolver (`apps/web/src/engine/resolver.ts`), which re-asks the API after expiry or `invalidate()`.
- **Web:** developer bench at `/dev/player` (lazy-loaded so the library page doesn't carry the engine): layers from the library, play/pause/step/scrub, blend/opacity/scale/rotation/offset/crop controls, HUD (fps, render ms, dropped, A/V offset, cache, decoders, open frames, barcode readout, diagnostics). Player commands are Actions (`actions/player.ts`: Space, ←/→, Shift+←/→, Home/End). `useShortcuts` now treats range sliders as non-typing and leaves Space/Enter on focused buttons to the native click.
- **Bundle hygiene:** `@lumacut/engine/barcode` (not `/testing`) is imported by the web app; importing `/testing` had pulled all fixtures into the production bundle.
- **Render page** (`apps/render-page`, Vite): `window.__lumacut.{info,perfMedia,render,benchmark,soak,seekCheck}`; `scripts/{smoke,perf}.ts` drive bundled Chromium (SwiftShader) and installed Chrome (`channel: "chrome"`, headless; it reported Apple M2 / Metal). `make perf-media` produces real M1 renditions of the 1080p samples (`samples/generated/perf`).
- **Perf gate definition (not yet run):** ≥30 presented fps, p95 render ≤33 ms, ≤1% of composition frames never shown (distinct frame indices, so a 60 Hz display of 30 fps content isn't penalised), no diagnostics or errors; soak: open frames 0, frames opened = closed, texture peak ≤256 MB, memory growth ≤100 MB. SwiftShader is reported as a floor, never gated. Scenario = 3 video tracks (1080p30, 1080p60, 720p24) + 2 image overlays with transform/opacity/blend over 1080p, 30 s timeline with cuts, plus sound.
- **Headless playback is slow by design:** SwiftShader gave about 7 presented fps in the player e2e, so e2e only asserts frames flow; the real frame-rate claim belongs to `make perf` on the GPU.

**2026-11-06 — M3a: ops, projects API, history, palette (decisions)**
- **`packages/ops`: `applyOp(project, op) → { project, inverse }`, pure** (`docs/ops.md` has the full semantics). Inverses are exact: structural ops invert directly; every clip-level op's inverse is computed by diffing the clips before/after (`removeClip` / `moveClip` / one `setProps` with `unset` / `addClip`), so no per-op inverse can drift. Clips on a track are kept sorted by `startUs` (canonical order), and invariants (references, track kind, ranges, overlap, source bounds, cycles, unique ids, locked tracks) are checked on the **end state of the top-level op**, so batches and inverses may pass through overlaps. 26 stable error codes (`OP_ERROR_CODES`).
- **Schema additions for exact inverses:** optional `index` on `addComposition`/`addAsset`/`addMarker`; optional `unset` list on `setProps` (`ClipUnsettable`) and `updateAsset` (`AssetUnsettable`). Regenerated JSON Schema + Pydantic models (`make gen-schema`).
- **Semantics chosen where the spec is silent** (all in `docs/ops.md`): `rippleTrim` start edge keeps the clip's start; `slipClip` deltas are in source µs; `slideClip` trims adjacent neighbours; `splitClip` drops `transitionIn`/`linkId` on the second half and moves the audio fade-out to it (the action relinks the new halves); `rippleDelete` range splits spanning clips with tail id `<id>-r<end>`; link groups of one are legal; `precompose` puts the nested clip on the lowest picture track involved and fails with `clips_overlap` if the span isn't free.
- **Keyframe time base (needs owner confirmation):** `Keyframe.tUs` is relative to the clip's `startUs`; `splitClip` partitions and shifts keyframes accordingly and inserts no boundary keyframe.
- **Projects API:** `projects` + `project_snapshots` tables (`0002_projects`), `POST/GET/PUT/DELETE /api/projects`, snapshots (create, list, restore as a new version, newest 100 kept). Saves send the whole document with `If-Match: <version>`; a stale version gets **412** with the current version in the `ETag` header; a missing header gets 428. The document is validated with the generated Pydantic `Project`; the server stamps `meta.updatedAt`. Deleting an asset that a project lists in `assets` fails with 409 `asset_in_use` (closes the M1 gap in part).
- **Web project store** (`stores/project.ts`, injected deps so tests use fake clock/client): `dispatch` is the only way to change the document (applyOp, history, autosave scheduling). Undo/redo stacks of `{undo, redo}` ops (200 deep); rapid edits with the same `coalesceKey` within 1 s merge into one step. Autosave: 1.5 s idle, 10 s max wait, retry with backoff (1 s doubling to 30 s) when offline or on 5xx, conflict → banner with "Load the other version" / "Keep mine and save". Late responses from a previously open project are ignored.
- **Action Registry:** `search` (own fuzzy scorer, no dependency), `grouped`, `toToolList` (plain data + JSON Schema args, for the AI in M12), `describeArgs` (flat args form from a Zod schema), `runAction` (single op as is, several as one labelled `batch`). The command palette (`Mod+K`, ARIA combobox, argument step generated from the schema), the shortcut list (`?`) and the right-click menu are all generated from `editingActions`. 18 editing actions registered (split, delete, ripple delete, duplicate, link/unlink, track add/remove/mute/solo/lock/hide, markers, add media at playhead, undo/redo, palette, help).
- **Web changes to shared pieces:** `useShortcuts(registry, ctx, onRun?)` can run actions through the host (op-returning actions); Space/Enter on a focused button is left to the button; `ActionButton` takes `onRun`; the library gained `project.new` and a projects list; `/project/:projectId` is a shell (outline of tracks and clips, playhead field, history list, add-media list) that the M3b timeline will replace.

**2026-11-06 — M3b-1: editor page, timeline, preview (decisions)**
- **A composition is exactly as long as its content.** Nothing updated `Composition.durationUs` (so the preview had nothing to play). `durationOps(project)` in `packages/ops` returns the `updateComposition` ops that make each composition end at its last clip; `projectStore.dispatch` folds them into the edit's own batch, so edit + duration is one undo step. Photo projects keep 0. A longer hand-set duration is therefore shortened by the first edit (project settings could later add a fixed length).
- **Gestures are pure** (`apps/web/src/timeline/gestures.ts`): move (selection + linked clips, lane change for the grabbed clip within its kind), trim / ripple trim, roll, slip (drag right shows earlier media; delta in source µs scaled by speed), slide, razor (reuses `splitOps`, so linked halves are relinked). Each returns one op (a labelled `batch` when several) or null. `geometry.ts` (zoom, frame rounding, ruler ticks) and `snapping.ts` (points: 0, clip edges, markers, playhead; 8 px threshold; snap or else land on a frame) are pure too.
- **What you see while dragging is what release applies:** the timeline draws `applyOp(project, op).project` computed on every pointer move; if `applyOp` refuses, the clips turn red with the reason and releasing does nothing. Escape cancels a drag.
- **Timeline UI:** DOM + CSS, one scroll container with a sticky header column and ruler; pointer events on `window` during a drag. Visual tracks are listed top-down in reverse array order. Clicking a clip selects its linked partners (Alt: just the clip; Shift/Ctrl toggles). Ctrl/Cmd+wheel zooms around the pointer; the view follows the playhead while playing.
- **Preview** (`editor/usePreview.ts`): one `PlaybackSession` per composition; project changes are pushed through a coalescing queue (an edit pauses playback: the M2 limitation); while playing the playhead follows the audio clock, while paused any playhead change shows that frame.
- **Actions added:** tools (V C B N Y U), zoom in/out/fit (`=` `-` `\`), snapping (Shift+S), select all / deselect, playback (Space, frame and second steps, Home/End), marker jumps (Shift+M / Alt+M). Track switches take an optional `{ trackId }` so header buttons run the same actions; they are listed whenever tracks exist and ask for a track when run without one. `ActionButton` gained `args` and `pressed`; `useShortcuts`/`ActionButton` can run actions through the host.

**2026-11-06 — M3b-2: inspector, clip media, clipboard, palette completeness (decisions)**
- **Inspector is generated from a field catalogue** (`apps/web/src/inspector/fields.ts`): each property is declared once (label, section, advanced, search keywords, display↔stored conversion, which clips it applies to, the `setProps` patch it makes). Sections: Transform, Opacity & blend, Crop, Time, Audio. Percent fields show 0–100, volume shows dB (silence at −60), fades show seconds. M4a/M5 add entries, not UI. Multi-selection shows only fields that apply, marks differing values "Mixed", and an edit is one `batch`. Scrubbing and arrow-stepping carry a `coalesceKey` (one undo step per drag); typed values and choices don't.
- **Typed maths** (`inspector/evaluate.ts`): `12`, `-5` (a negative number), `+10`, `*2`, `/2`, trailing units ignored; anything else is explained and never applied. Search matches label, keywords and section and shows advanced fields too.
- **Clip media:** video clips get a sprite-sheet filmstrip chosen by source time (speed/reverse/freeze aware), picture-track clips only; audio-track clips get a waveform of their source range (mirrored when reversed); only clips near the visible window fetch or draw anything (`timeline/filmstrip.ts`, `timeline/waveform.ts`, `editor/useClipMedia.ts`).
- **Clipboard** (`timeline/clipboard.ts`, internal to the editor): paste puts the first clip at the playhead, each clip back on its own track when free, else another free unlocked track of that kind, else a new track; ids are new; link groups copied whole are re-linked among the copies; a transition survives only if the clip before it was copied too. Attribute copy/paste moves picture attributes between picture clips and audio attributes between audio clips.
- **The palette can do everything a gesture can** (needed by the acceptance test): `timeline.addAssetAtPlayhead` takes an asset name or id (ambiguity is an error that names the candidates); `playback.goToTime`, `selection.clipAtPlayhead` / next / previous clip, `clip.moveBy`, `clip.trimStartTo` / `trimEndTo`. They emit the same ops as the gestures.
- **Shortcut fix:** while a text field has focus, Mod+A/C/V/X/Y/Z stay with the field (they were being taken by Undo etc.).
- **Acceptance spec** (`apps/web/e2e/acceptance-m3.spec.ts`): the same edit (cut a 10 s video at 2/4/6/8 s into five picture clips with their sound, move the last 2 s later, trim the first to 1.5 s) is built once with palette+keyboard only and once with mouse only; each is read back from the timeline, the page is reloaded, and the clips must be identical, and identical between the two flows. Setup (upload, create project) is shared. The spec counts 5 picture clips + 5 linked sound clips.

**2026-11-07 — verification pass of M2+M3: what it found and changed**
- Missing `zod` dependency in `apps/web` (Docker build failed) → added; the web Dockerfile copies the engine and ops packages.
- **Space didn't play after clicking a toolbar/tab button** (focus stolen) → `ActionButton`, `TrackHeader` buttons use `onMouseDown` preventDefault. Real bug.
- **Trimming an edge of a linked clip didn't trim its partner by mouse** while the palette flow did (found by the acceptance spec). Fixed test-first in `trimGesture` (takes `selectedIds`, trims linked partners by the same delta, one undo step "Trim clips"); 3 unit tests + a Timeline component test.
- Lint-driven patterns: `must()` (`apps/web/src/lib/must.ts`) instead of `!`; refs written in effects, not render; callback ref (`attachStage`) rather than a ref object from a hook; no dynamic `delete`.
- Test expectation errors corrected (my oracle, not the code): `moveClip` picture→audio is allowed for video assets; palette search "razor" rightly ranks the Razor tool first; autosave max-wait timing; e2e helper used `must` inside `page.evaluate`; linked selection counts as "2 clips selected" (use Alt-click for one).
- Integration test now builds a valid PNG programmatically (a hand-typed one crashed the worker's decode); `test_engine_fixtures.py` skips at module level when fixtures aren't mounted.
- render-page harness: `call(fn, arg)` passes data into the page (closures can't see Node variables); `smoke.ts` also compares an image asset across backends to isolate decoder from compositor.

**2026-11-07 — M4 (one milestone; see `docs/ops.md`, `docs/color.md`, `docs/effects.md`)**
- **Keyframes:** `evaluate`/`animatedClip` live in `packages/ops/src/keyframes` (the engine depends on ops). `addKeyframe` now validates the path and value kind (`invalid_property`); two animated properties can't drive the same field (`transform.x` vs `transform.position`); `removeEffect` removes the effect's keyframes. A segment's behaviour is set by its first keyframe; bezier uses AE influence/speed along a *distance* coordinate (value difference, spatial path arc length, linear-light colour distance); a missing ease is linear. `splitClip` splits a spanning segment with De Casteljau so neither half jumps and bakes a constant into a half left without keyframes (this changed the old "no boundary keyframe" behaviour).
- **UI:** one ◆ control (`components/params/KeyframeToggle`) on every animatable inspector field, effect parameter and colour parameter; position/scale/anchor are point properties (X and Y share one keyframe track, AE-style). Volume and pan have no ◆ until M7 (the audio engine doesn't apply keyframes). Editing an animated field at the playhead writes a keyframe. Graph editor: value and speed graphs, drag keys and ease handles, presets (ease in/out, hold, linear, and baked overshoot/bounce/elastic); bottom dock tab next to the Timeline; no zoom/pan.
- **Colour:** one shader, specified by `packages/engine/src/color/reference.ts` (`docs/color.md`). A layer with colour or effects is first drawn into a layer-local target in linear light (cropped, on a whole-pixel grid, at no more resolution than it is drawn at), then transformed, so such layers are filtered in linear light while plain layers keep M2's encoded-space filtering.
- **LUTs:** `builtin:*` ids are eight formula-generated looks (no files, no licence); a user `.cube` is a library asset of kind `lut` (worker validates it, keeps the file as the `lut` rendition; the engine resolves it with `resolve(id, "lut")` and parses it). Choosing a library LUT adds it to the project in the same undo step.
- **Scopes:** engine option `scopeWidth` blits the canvas to a small RGBA8 target (GPU) and reads it back; waveform, parade, vectorscope, histogram are pure functions over that sample. Updated at most ~8×/s paused, ~2.5×/s while playing.
- **Effects:** `packages/effects`, one folder per effect (`index.ts` + `.frag.glsl`), 40 effects (the 36 SPEC names + invert, threshold, duotone, scanlines), one shared Gaussian/bright-pass/glow shader set, a registry that feeds the effects browser, the `effect.*` actions and the auto-generated inspector controls. Solid and adjustment clips are drawn (`solid.color`, schema addition). Time-dependent effects use `uFrame` + a seed parameter through GLSL hash noise (`packages/effects/src` is covered by the determinism lint).
- **Transitions:** 14 transitions; `transitionIn` blends from the touching previous clip; window by `alignment`; both clips are drawn alone at composition size, mixed by a shader; handles are read from the source when the media has them, otherwise the edge frame is held. `setTransition` now requires a touching previous clip and a window that fits. Morph-cut deferred (SPEC allows v1.5).
- **Text:** rasterised with `OffscreenCanvas` in the worker per run/box, cached by content, uploaded like an image. For text and caption clips `transform.anchorX/Y` are measured from the **centre** of the text picture, so 0,0 centres it on `x,y`. Layout (`text/layout.ts`) is pure over a `Measurer`. Bundled OFL fonts load from `/fonts/` (`apps/web/public/fonts`, also served to the render page).
- **Captions:** words with clip-relative times; pages of `maxLines` × `maxCharsPerLine`; the spoken word can take `highlightColor` (schema additions: `highlightColor`, `maxLines`, `maxCharsPerLine`). Created from pasted text (even timing), SRT/VTT, or by hand; eight styles in `captions/styles.ts`; editor for each word's text and timing, split/merge/delete.
- **UI components live in `apps/web/src/components/*`** (params, graph, color, effects, scopes, text), not in a `packages/ui-kit` (nothing outside the web app uses them).


**2026-11-08 — M5 (one milestone; see `docs/shapes.md`, `docs/masks.md`, `docs/presets.md`)**
- **Shapes** are rasterised with Canvas 2D `Path2D` in the worker (like text) at 1×/2×/4× resolution buckets, cached by content, uploaded as an image. Shape and text clips measure `anchorX/Y` from the picture centre (`LayerSource.anchorShift {x, y}`, replacing `anchorCenter`).
- **Masks:** path masks are rasterised to one alpha picture, **feather uses the canvas `blur()` filter** (not the GPU Gaussian as first planned), multiplied in a `mask` pass after crop and before colour. Bitmap masks arrived in M6.
- **Track mattes:** the matte clip is hidden (not drawn on its own) by `planLayers`; matte and clip are drawn alone at composition size and combined by `matte.frag.glsl` (alpha, alphaInverted, luma, lumaInverted).
- **Motion blur:** N sub-frame draws averaged by additive blending, only for clips with keyframes (`isAnimated`); sub-frame times derive from the frame, never the clock. Limit: media frames are the frame's own and only animated properties change between samples.
- **Text animators:** per-unit coverage (square, rampUp, rampDown, triangle, round, smooth) and per-character drawing; `textMargin` includes the animators' motion; captions keep their animators.
- **Keyframe vocabulary** (`paths-motion.ts`) extends `resolveProperty` for masks, shape fill/stroke/trim/round corners/items, text animator range and props, `motionBlur.shutterAngle`; `removeMask` removes its keyframes.
- **Overlay:** one SVG layer in composition pixels over the preview; geometry is pure (`apps/web/src/overlay/*`), `PreviewOverlay.tsx` only maps pointer events to ops. Tools (`V`, `P`, `R`, `E`, `Shift+P`, `Shift+E`, `Alt+P` for pen mode) are registry actions; the editor store keeps `canvasTool`, `penMode`, `compositionTrail`.
- **Presets:** pure keyframe generators in `packages/ops/src/presets` (15, four categories); `setFrames` replaces keyframes inside the window so re-applying is idempotent; shake/glitch use a seeded PRNG keyed by clip id and start. `preset.apply` and `motion.blur` are actions; a Presets tab lists them.
- Lint-driven: no `!` non-null assertions (bind to a local first); drop `as` casts the type-aware lint reports as unnecessary.

**2026-11-08 — M6 (one milestone; see `docs/photo.md`)**
- **One preview window instead of a full-size canvas:** `RenderOptions.view` / `Engine.setView` draw a window of a composition at a scale (canvas = the window's size, layer matrices pre-multiplied by the view matrix; nested compositions are still drawn whole). The photo stage draws only the visible part at screen resolution; the same mechanism tiles exports. Image layers use the 2048 px `preview` rendition when drawn small, the original otherwise; originals above the GPU limit are shrunk on load.
- **Photo layers are tracks with one clip each**, all at t = 0 (default image length), `durationUs` 0 (`durationOps` already skips photos). Layer panel = the visual tracks, top first. Photo projects have no audio track.
- **Paint layers** are drawn from the vector strokes by Canvas 2D stamps into a live canvas kept per layer (incremental); the layer covers the canvas plus strokes up to one canvas size beyond each edge (`anchorShift` places it), at a power-of-two resolution within 16 M pixels.
- **Bitmap masks** use the image's alpha channel. The mask brush edits a local picture shown live through `Engine.setMaskOverride`, then saves it as a library image and swaps it in with one undo step. Orphaned mask pictures stay in the library (no clean-up until M13).
- **Selections are editor state** (one Bézier path + feather + invert), turned into a layer mask by `marquee.toMask`; the actions are `marquee.*` because `selection.*` is the timeline's clip selection.
- **Canvas operations** (`crop`, `rotate`, `straighten`, `flip`, `resize`) are all one `CanvasEdit` (new size + a map of old to new pixels); every picture layer is moved by it (exact transform maths; colour fills and adjustment layers stay full-canvas); nothing is destroyed. They are refused when a layer has an animated transform.
- **Export** (`export.image`, window `export.open`): a separate `EngineClient` per export draws tiles with `readback`, stitched on an `OffscreenCanvas`, flattened onto a colour when asked (always for JPEG), PNG/JPEG/WebP; any video frame uses the same action. Limit 16384 px per side.
- **Shortcuts are unique in the registry** (a duplicate throws at module load). **Bug found while adding photo tools:** M5's `tool.penMode` used Shift+M, which `marker.next` already owns, so the editor would have crashed on load. Pen mode is now **Alt+P**. A throwaway check (`node --experimental-strip-types` importing the action modules and listing `shortcut`s) finds these; modules that import GLSL can't load in plain node, so scan the source for the new ones.
- **`Alt+letter` shortcuts now work on macOS:** `shortcutFromEvent` reads the physical key (`event.code`) when Alt is held (Option+B types "∫").
- Photo tool shortcuts: Alt+R/Alt+O rectangle/ellipse marquee, L lasso, Alt+C crop, Alt+B brush, Alt+X eraser, Alt+K mask brush, H hand, Z zoom, `[` `]` brush size, Mod+0/1/=/- view, Mod+Shift+D deselect, Mod+Shift+I invert selection, Mod+Shift+E export, Mod+] / [ order, Mod+J duplicate layer, Mod+G / Mod+Shift+G group / ungroup.

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
- **`docs/` folder added**, holding the pre-M0 review and `ops.md` (op semantics).
- **M3a schema additions** beyond SPEC §4: `index` on three add-ops and `unset` on `setProps`/`updateAsset` (see Decisions).
- **M4 schema additions** beyond SPEC §4: optional `Clip.solid {color}`; optional `CaptionData.highlightColor`, `maxLines`, `maxCharsPerLine`; new op error code `invalid_property`; `lut` asset kind is now produced by the API/worker.
- **M5 deviations:** shapes are Canvas 2D rasters, not tessellation/SDF (SPEC §6 says "tessellation or SDF"); mask feather uses the canvas blur filter; no `Lower third` starter (that is a template, M9); raster masks deferred to M6/M11; no new schema fields were needed (shapes, masks, mattes, motion blur and animators were already in the schema).
- **M6 deviations:** AI subject select is M11 (not in M6); layers panel has no thumbnails; merge/flatten, magic wand, selection boolean ops and selection-clipped brushes are not built; image export is the M6 part of SPEC §11 (video/GIF/audio stay M8); the API grew optional `width`, `height`, `background` on project creation (no schema change).
- **M4: no `packages/ui-kit`** (components stay in `apps/web`), **no morph-cut**, 40 effects = the 36 named in SPEC §6 plus invert, threshold, duotone and scanlines (SPEC asks for at least 40 but names 36).
- **M1:**
  - **"MinIO" in the M1 request means SeaweedFS** (the swap was approved before M0).
  - **`Action.run` may return `void` / `Promise<void>`** as well as `Op | Op[]`, so app-level commands (upload, retry, log out) are Actions too.
  - **The processing job timeout scales with file size, not duration**, because duration is unknown before the probe.
  - **`assets.kind` is nullable** until known: it's guessed from the MIME type at upload and confirmed by the probe.
  - **Plan file names differ:** `services/api/lumacut_api/resources.py` replaces the planned `db.py`/`storage.py`/`queue.py`.

## Known gaps
- **Op payload shapes are provisional until M3** implements `applyOp`. `schemaVersion` stays 1 until projects are first persisted (M3); after that, every breaking schema change needs a migration in `packages/schema/src/migrations.ts`.
- **Schemas not yet defined:** `Analysis` and `EditPlan` (M10). Effect and transition *definitions* live in `packages/effects` (not persisted, so not in the generated schema); only `EffectInstance`/`TransitionInstance` are in the schema.
- **Not created:** `packages/ui-kit` (UI components live in `apps/web`; see M4 decisions). `packages/ops` (M3) and `packages/effects` (M4) exist.
- **No CI pipeline** (no git remote). Checks run locally via `make check` / `make test-stack` / `make test-samples`.
- **Dev-only infra:** the web container serves the build with `vite preview`, images aren't hardened, and credentials are dev placeholders. A production deployment setup is outside v1 M0 scope.
- **No speech or talking-head samples.** M10/M12 need licensed real footage (review #35).
- **M1 gaps:**
  - No sweep for abandoned multipart uploads; they stay "Upload paused" until resumed or deleted (M13).
  - No login rate limiting, password reset or email verification.
  - No HEIC input (libheif/x265 licensing).
  - No storage quotas.
  - No original-file download.
  - Asset deletion is not yet guarded against use in projects (M3).
  - The dev stack's SeaweedFS reflects any origin for CORS. Production must pin origins (`-s3.allowedOrigins` or bucket CORS).
  - The SSE event payload type is hand-mirrored in `apps/web/src/stores/assets.ts` (`AssetStateEvent`), because SSE streams aren't part of the OpenAPI contract. Python integration tests check the fields.
  - The asset list returns at most 500 newest (plus `total`); there is no cursor pagination yet.
  - Deleting an asset while it processes stops the RQ job best-effort. If the job still finishes, it deletes its own renditions.
  - The worker writes temp files to the container's `/tmp`; large uploads need enough container disk (no dedicated volume yet).
  - Encoding the proxy and master for long 1080p sources on CPU can take tens of minutes. More worker replicas scale it, and GPU encoding isn't considered yet.
  - The resume path that uses a stored FileSystemFileHandle can't be automated (native picker). e2e covers the re-pick path, and the handle path is a manual test.
  - Web page components rely on e2e coverage. Unit tests cover the upload engine, SSE parser, stores, actions and components; overall web line coverage isn't gated.
- **M2 gaps:**
  - `make test-samples` wasn't re-run after the M2/M3 edits (the M1 pipeline is untouched).
  - **Cross-backend tolerance (measured):** the compositor is bit-identical between SwiftShader and the GPU (image asset, 0/255 difference); the video difference is decoder-only (SSIM ≈ 0.998 on the same composition). Golden-image tests for effects (M4a-3) must therefore use still-image inputs, with video only for non-pixel-exact checks.
  - No full-size-media seek test in `make test-engine` (it only runs the existing suites).
  - Keyframes are not evaluated (`resolveClipProps` is static until M4a). Masks, colour grade, effects, mattes, motion blur and text/shape/adjustment/caption/paint clips are diagnosed, not drawn. The `solid` clip type has no colour field in the schema.
  - Audio fades, keyframed volume, effects, reverse, freeze and `speed ≠ 1` audio are diagnosed, not played (M7).
  - Images larger than the GPU texture limit fail with a diagnostic (tiling in M6). Images above 8192 px are laid out at their downscaled size (the declared size is the normalized one).
  - BT.709 vs sRGB transfer is approximated; no HDR. No anti-aliasing on rotated layer edges. WebGPU is an interface only.
  - The full SPEC perf scenario (text, shapes, colour, effects) is added to M4a and M5 acceptance.
  - Playwright's bundled Chromium has H.264 here, but Linux CI would need `channel: "chrome"`. Presigned-URL refresh is basic (45 min TTL, re-resolve on `invalidate`).
  - The `/dev/player` barcode readout only decodes when the barcode clip fills the composition unscaled. Editing a layer pauses playback (project reload).
- **M3a gaps:**
  - No op renames the project (`Project.name`), so there is no `project.rename` action yet; a `setProjectProps` op is needed (rule 2).
  - Autosave sends the whole document; there is no op-log sync, so concurrent edits are caught by version conflict only. Undo history is not persisted across reloads. `beforeunload` can't flush an async save: the page saves on `visibilitychange`/`pagehide` and warns when unsaved.
  - The asset-in-use guard looks at the project's `assets` list, not at clips; migrations of `schemaVersion` exist in TS only (the server rejects versions other than 1).
  - `applyOp` re-validates every touched composition in full (O(project) per op): fine for now, to be optimised if drag editing needs it. The composition-cycle check exists in both `packages/ops` and `packages/engine`.
  - Keyframes: splitting mid-animation can jump (no boundary keyframes; M4a-1).
  - The palette searches editing actions only (effects, presets, templates and settings join in M4/M9); the right-click menu is attached to the outline only.
  - Shortcut editor not built.
- **M3b-1 gaps:**
  - Pointer/drag code is covered by pure-function tests and the e2e specs; the real mouse feel hasn't had a manual pass.
  - The whole editor page re-renders on every animation frame while playing (the editor store is read in full); acceptable now, to be narrowed if playback stutters.
  - Editing during playback pauses it (engine `setProject`); an incremental engine update is an M2 follow-up.
  - Not built: inspector, clip thumbnails and waveforms, clip context menu, copy/paste of clips and attributes, in/out points, rubber-band selection, opening a nested composition to edit it, Simple-mode magnetic track, shortcut editor, markers with duration/rename in the UI.
  - Dragging a clip to another lane moves only the grabbed clip (linked partners stay on their lanes); there is no "new lane" drop target.
- **M3b-2 gaps:**
  - Inspector: no keyframe ◆ control (M4a), no colour/effects/masks/text/shape sections (M4a/M5); crop edges and speed accept any value in range without cross-field checks; the Time section's source in/out and duration are read-only.
  - No drag-and-drop from the asset list onto lanes (the Add button places at the playhead), no in/out points, no rubber-band selection, no system-clipboard integration (the clipboard lives in the editor and is lost on reload).
  - Undo history is still not kept across a reload.
- **M4 gaps:**
  - **Nothing in M4 was tested after the first stages** (see Current focus): no goldens for the 40 effects and 14 transitions, no GPU compile of any of their shaders, no tests for text, captions, transitions, adjustment/solid clips, the effects/text/transition inspectors, the effects browser, or the `effect.*`, `transition.*`, `text.*`, `caption.*`, `layer.*`, `color.*` actions. `setTransition`'s new validation likely breaks existing ops tests.
  - Effects' independent checks (planned instead of "a golden only proves unchanged"): invert/posterize/threshold/fill/letterbox exact pixel maths; blur preserves the mean; mirror/kaleidoscope symmetry; chroma key clears the key colour; grain differs by frame but not for the same frame and seed; every effect's output differs from its input.
  - Graph editor: no zoom or pan; value-graph handles only for numeric properties (points and colours edit ease in the speed graph); colours and shapes can't overshoot/bounce presets.
  - Transitions: no drag handle on the timeline badge for the duration (use the Inspector or `transition.setDuration`); audio is not crossfaded (M7); the engine reads source handles only for video and nested compositions (images and solids don't need them).
  - Text: no on-canvas text editing, no text animators (diagnosed `ignored_text_animators`, M5), one font file per weight for Poppins/Bebas (nearest weight is used), text glyph antialiasing is OS-specific so text goldens will need a tolerance; rich text (several runs) can be rendered but the Inspector edits one style for all runs.
  - Captions: no speech-to-text until M10; word timing is edited numerically (no waveform view); karaoke highlighting is per word colour only.
  - Colour: no HDR / wide gamut, no log-input LUTs, trilinear (not tetrahedral) LUT interpolation; wheels are numeric rows (no graphical wheel yet).
  - `.cube` assets: the library UI shows them with a generic icon; the Docker worker image must be rebuilt for `.cube` uploads to process.
  - Engine: playback still pauses on every project edit (M2 limit), which includes scrubbing a ◆ value while playing; the full SPEC perf scenario with text, shapes and effects was not run (shapes arrive in M5).
- **M5 gaps:**
  - **Nothing in M5 was tested** (see Current focus): three new GLSL shaders never compiled, no goldens for shapes/masks/mattes/motion blur/animators, no tests for the new keyframe paths, presets, overlay geometry, inspector builders or actions, and the lower-third acceptance e2e is not written.
  - Overlay: untested by hand; no multi-select gizmo, no snapping/guides, no on-canvas text editing, no rotate/scale about a custom pivot; the pen has no smooth/corner toggle after placement; path editing covers shape paths and masks, not paint strokes (M6).
  - Shapes/text re-rasterise on every frame while an animated property changes (cached by content, so static frames are free); a 1080p animated shape costs CPU per frame.
  - Motion blur: no per-effect-parameter blur for non-animated effects, media frames are not sub-sampled, a nested composition is blurred as one layer; the cost is `samples` draws per frame.
  - Track mattes: the matte must be in the same composition; no matte chains; the hidden matte clip is only explained in the inspector.
  - Presets: 15 presets, no custom/saved presets, no preview thumbnails, no per-preset parameters beyond strength and length; text presets need a text or caption clip.
  - Playback still pauses on every project edit (M2 limit), so dragging on the canvas while playing is interrupted.
- **M6 gaps:**
  - **Nothing in M6 was tested** (see Current focus): the engine `view` has no equivalence tests, paint/bitmap masks/selection/canvas maths/layer actions/export have none, the acceptance e2e isn't written, and the overlay, stage zoom/pan and tool options were never used by hand.
  - Engine: text is rasterised at 1× (soft when zoomed far in); effects whose noise depends on pixel position differ between scales and tiles; nested compositions render whole at native size inside a windowed render; a bitmap mask is stretched over the layer's declared size.
  - Paint layers: no selection clipping, strokes beyond one canvas size outside the edge are dropped, a mask on a paint layer whose strokes extend past the canvas is misaligned (layer space differs from stroke space), up to 16 M raster pixels (large canvases paint at reduced resolution).
  - Mask brush: saved pictures accumulate in the library; saving needs the worker to process the upload (a few seconds), edits made meanwhile are in the live override only; one bitmap mask per layer is edited (the first).
  - Layers: no thumbnails, no merge down / flatten, ungroup only for unmoved groups, groups made from layers of different canvases aren't supported.
  - Selection: single selection, replace-only; AI subject select (M11); the crop tool applies on request (no live crop preview of the result) and its straighten grid is a guide.
  - Export: one picture at a time (no batch), no colour profile embedding, WebP/JPEG quality only, the dialog shows no estimated file size; the 16384 px limit is a browser one.
- **Python dev-stub packages** (`types-aiobotocore*`, `botocore-stubs`) must only be imported under `TYPE_CHECKING`; they aren't installed in images.

## Dependencies & licenses
_M5 added no dependencies (Canvas 2D, OffscreenCanvas and the existing GL stack only); the engine package gained a `./shapes` export._

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


**Added in M1**
| Package | Version | License | Where |
|---|---|---|---|
| PyJWT | 2.15.1 | MIT | api |
| argon2-cffi | 25.1.0 | MIT | api |
| email-validator | 2.3.0 | Unlicense | api (pydantic `EmailStr`) |
| sse-starlette | 3.6.0 | BSD-3-Clause | api |
| numpy | 2.5.4 | BSD-3-Clause (+0BSD, MIT parts) | worker (waveform) |
| Pillow | 13.0.0 | MIT-CMU | worker (images, sprite sheets) |
| pytest-xdist | 3.8.0 | MIT | worker image `test` group |
| react-router | 8.5.1 | MIT | apps/web |
| zustand | 5.0.16 | MIT | apps/web |
| radix-ui | 1.8.1 | MIT | apps/web |
| openapi-fetch | 0.17.0 | MIT | apps/web |
| openapi-typescript | 7.13.0 | MIT | apps/web (dev, codegen) |
| idb-keyval | 6.3.0 | Apache-2.0 | apps/web |

**Added in M2**
| Package | Version | License | Where |
|---|---|---|---|
| mediabunny | 1.65.x | MPL-2.0 (file-level copyleft; used unmodified) | packages/engine |
| @vitest/browser-playwright | 5.0.5 | MIT | root (dev) |
| fast-check | 4.10.2 | MIT | packages/engine (dev) |
| @playwright/test | 1.64.1 | Apache-2.0 | apps/render-page (dev; installed Google Chrome is used for the GPU backend) |

No new Python packages or AI models.

**Added in M3a/M3b-1:** no new dependencies (`@lumacut/ops` is a new workspace package; `fast-check`, `zod`, `radix-ui` already present).

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

**Added in M4**
| Package / asset | Version | License | Where |
|---|---|---|---|
| @lumacut/effects, @lumacut/ops (as engine dependencies) | workspace | — | packages/engine, apps/web |
| Inter | variable, Google Fonts repo | OFL-1.1 | apps/web/public/fonts (Inter.ttf, Inter-Italic.ttf) |
| Montserrat | variable | OFL-1.1 | apps/web/public/fonts |
| Poppins | Regular/Italic/Bold/BoldItalic | OFL-1.1 | apps/web/public/fonts |
| Playfair Display | variable | OFL-1.1 | apps/web/public/fonts |
| Bebas Neue | Regular | OFL-1.1 | apps/web/public/fonts |
| Roboto Mono | variable | OFL-1.1 | apps/web/public/fonts |
| Caveat | variable | OFL-1.1 | apps/web/public/fonts |
| Built-in LUTs (`builtin:*`) | generated from formulas | ours | packages/engine/src/color/builtin-luts.ts |

No new npm or Python libraries. Each font's licence text is next to it (`apps/web/public/fonts/OFL-<family>.txt`).
