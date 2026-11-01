# Pre-M0 spec review

All defaults below were accepted by the owner on 2026-11-01. Items marked **Q** were open questions at review time; each one was resolved by accepting its proposed default. The outcomes are logged in PROGRESS.md (Decisions / Deviations).


## 1. Core architecture (my understanding)
1. **One document:** a `Project` (Zod in `packages/schema`, from which JSON Schema and Pydantic are generated) holds assets and compositions. Video, motion and photo projects are all compositions; a photo is a one-frame composition. Time is integer µs.
2. **One edit path:** every change is an `Op`. `applyOp(project, op)` is pure and returns `{project, inverse}`. `batch` is atomic and counts as one undo step. Undo/redo, autosave, AI and templates all go through ops.
3. **One action system:** each feature is defined once as an `Action` (metadata, `when(ctx)`, Zod `argsSchema`, `run → Op[]`). Menus, toolbar, palette, context menus, shortcuts, the help overlay and the AI tool list are all generated from the registry.
4. **One engine:** `renderFrame(project, compId, tUs)` is deterministic and runs in a Web Worker (WebGL2 on OffscreenCanvas, with a backend abstraction for WebGPU). It recurses into nested compositions, composites tracks bottom-up, and runs a fixed per-clip pipeline (source → crop → masks → color → effects → transform → blend → matte → motion blur).
5. **Media:** the worker creates proxies (FFmpeg). The browser decodes with Mediabunny + WebCodecs into an LRU cache. The audio clock drives playback.
6. **Same engine for export:** browser export uses WebCodecs + Mediabunny. Server export runs the same engine in `render-page` under Playwright and pipes raw frames to FFmpeg.
7. **AI flow:** analysis is cached per asset. The LLM decides *what* (an EditPlan, or action calls), deterministic compilers produce ops, and the user previews and then applies them. Pixel-generating tools add a *new asset* and ops. Every run is logged in `meta.aiRuns`.

---

## 2. Ambiguities, contradictions, risky points → proposed resolution
Items marked **Q** need your answer. The rest are decisions I'll take and record in PROGRESS.md unless you object.

### Data model / ops
| # | Issue | Proposed resolution |
|---|---|---|
| 1 **Q** | The op list is incomplete. There is no op for removeAsset/updateAsset, removeComposition/updateComposition (aspect change, fps), markers, track props (mute/solo/lock/hide), link/unlink, template placeholders, or paint strokes. | Add `updateComposition, removeComposition, removeAsset, updateAsset, addMarker/updateMarker/removeMarker, setTrackProps, linkClips/unlinkClips, setPlaceholder`. Keep `setProps` for generic clip props. Log the additions as a deviation. |
| 2 | Linked A/V and "reverse" have no schema fields. Freeze frame is not defined. | Add `Clip.linkId?` and `Clip.reversed: boolean`. Freeze frame becomes a new media clip with `freezeAtUs`. |
| 3 | `speed` is a float but time is integer µs, so `(out−in)/speed` is fractional. | A single helper, `clipTimelineDurationUs()`, with fixed rounding (`Math.round`) that every package uses. Ops validate that it is ≥ 1 µs. |
| 4 | `fps` is a number, so 29.97 is not representable exactly. Phone footage is VFR. | Store `fps` as a rational `{num, den}` and add frame↔µs helpers. Proxies (and export masters, see #12) are made **CFR** by FFmpeg, which keeps frame-exact seeking tractable. |
| 5 | A photo has `durationUs = 0`, but clips need `out > in` to be visible. | Photo compositions render only at t=0. Clips still get a 1-frame minimum duration. Still images have no intrinsic duration limit. |
| 6 | `Keyframe.value` can't hold a `BezierPath`, yet mask paths are keyframeable. Property paths into arrays (effects, masks, animators) are fragile. | Add `BezierPath` to the value union. Property paths address items by **stable id**, never by array index (e.g. `effects.<id>.params.radius`). |
| 7 | Masks are bezier-only, but brush masks and AI subject select produce raster masks. | Make `Mask` a union of `kind: "path"` and `kind: "raster"`. A raster mask points to an `assetId`. |
| 8 | Photo "groups" in the layers panel have no schema. | A group is a nested composition (precompose). Photoshop "pass-through" blending isn't possible that way; I'll list it as a known gap. |
| 9 **Q** | Paint uses `strokesAssetId`. If every stroke means uploading a new asset, that means network churn plus undo complexity. | **Recommend:** store quantized stroke data inline in `clip.paint.strokes` and keep the raster cache local. The alternative keeps the spec (addAsset + setProps per stroke batch). |
| 10 | Captions have no word timing, which karaoke styles and AI captions need. | Add `Clip.caption?: { words: {text,startUs,endUs}[], styleId }`. |
| 11 | The transition model is unspecified (alignment, handles). | `transitionIn` on clip B is centered on the cut by default (with start/end alignment as options). It uses media handles beyond A's out and B's in. When handles run short it holds the edge frame and shows a UI warning, as Premiere does. |
| 12 | `HSL qualifiers` have no defined structure. | Use 8 hue bands (red…magenta) with hue/sat/lum each, plus the curves listed in the spec. |
| 13 | Schema migrations exist in TS, but Python also reads documents. | Write migrations **in TS only**. The worker image includes Node anyway (Playwright), so Python runs migrations and `applyOp` validation through a small Node CLI from `packages/ops`. Ops logic is never duplicated in Python (see risk 3). |

### Engine / media / export
| # | Issue | Proposed resolution |
|---|---|---|
| 14 **Q** | §9 says proxies are **≤720p**, but §6's perf target says "**1080p proxy**". | **Recommend:** keep 720p proxies, use a 1080p composition, and render preview at viewport resolution. The perf test measures a 1080p comp output fed from 720p proxies. The alternative is 1080p proxies, which means more decode load and storage. |
| 15 **Q** | "Originals on export" break when originals are HEVC, ProRes or VFR, because WebCodecs (and server-side Chromium) may not decode them. Originals above 1080p are wasted in v1. | **Recommend:** at upload the worker also produces an **export master**: ≤1080p, CFR, high-bitrate H.264, short GOP. Both export paths use it. This guarantees decodability and browser/server parity. |
| 16 **Q** | Playwright's bundled **Chromium has no H.264/AAC**. Server export would fail to decode. | Use Playwright `channel: "chrome"` (branded Google Chrome) in the worker image. Chrome for **ARM64 Linux shipped in 2026**, so this also works on Apple-silicon Docker (must verify in the M8 image). |
| 17 | Headless Chrome with no GPU: since **M139, WebGL no longer falls back to SwiftShader** automatically. | Launch `render-page` with `--enable-unsafe-swiftshader`. It only ever loads our own trusted page. A GPU worker is optional for speed. CPU rendering of a long 1080p export will be slow (risk 2). |
| 18 | "Deterministic / identical output" can't hold across GPUs or drivers. | Bit-identical holds on the same machine and backend. Across backends I'll use tolerances: goldens allow max channel diff ≤2/255 or SSIM ≥0.995, and export parity uses SSIM ≥0.98 as the spec says. Goldens are generated and checked in **pinned headless Chrome + SwiftShader** in CI. |
| 19 | Golden tests need WebGL2, which plain Vitest in Node doesn't have (headless-gl is WebGL1 only). | Effect and transition goldens run in **Vitest browser mode (Playwright provider)**. `make check` will therefore need Playwright browsers installed. |
| 20 | Text in a worker, and parity of font rasterization across OSes. | OffscreenCanvas 2D text, with fonts loaded via `FontFace` in the worker and **bundled OFL fonts only** (no system fonts). Grapheme splitting for per-character animators uses `Intl.Segmenter`, which handles Bangla clusters. HarfBuzz (harfbuzzjs, MIT) only if glyph-level positions turn out to be needed. |
| 21 | The audio clock is on the main thread while rendering runs in a worker, and a decoded-audio ring buffer wants SharedArrayBuffer. | Enable **cross-origin isolation (COOP/COEP) from M1**. Object storage must send CORP/CORS headers, or be proxied through the API. Deciding this late breaks asset loading. |
| 22 | Web Audio has **no pitch-preserving time-stretch**. | Use **signalsmith-stretch** (MIT) in an AudioWorklet and offline. Avoid SoundTouch (LGPL) and Rubber Band (GPL). |
| 23 | Browser AAC encode isn't guaranteed (Chrome on Linux often rejects it). Browser MP3 encode doesn't exist. | Probe with `AudioEncoder.isConfigSupported` and fall back to `@mediabunny/aac-encoder` (MPL-2.0, wasm FFmpeg AAC). MP3 and GIF are server-only. WAV can be produced in the browser. |
| 24 | Photo memory: an 8192² image is 256 MB in RGBA8 and 512 MB in RGBA16F, for each layer. | Preview renders at viewport resolution from mip/downsampled sources. Full resolution only at export, rendered as **tiles**. Texture memory stays within the budget. |
| 25 | Color management is not specified. | Working space is linear Rec.709. Input transfer comes from `VideoFrame.colorSpace`. Preview outputs sRGB; export outputs BT.709 with matching tags. |
| 26 | Server export: piping raw frames out of the page is expensive (about 8 MB per frame). | `render-page` streams frames as binary over a localhost WebSocket to the worker, which pipes them to FFmpeg stdin. Audio is rendered by OfflineAudioContext as WAV and muxed by FFmpeg. |

### AI
| # | Issue | Proposed resolution |
|---|---|---|
| 27 | Ask runs the LLM on the server, but Actions (with `when` and `run`) live in TS in the browser. | Export a JSON tool manifest (id, description, args JSON Schema). The server LLM returns action calls; the **client** runs them to get ops, then preview, then apply. Keys stay on the server. |
| 28 | The auto-edit validator needs to apply ops, but it runs in Python. | Use the Node ops CLI from #13 for apply and validate. |
| 29 **Q** | The EditPlan includes "music", but no music source is defined. | **Recommend:** user-selected audio assets only in v1 (no bundled library). |
| 30 **Q** | **LaMa weight license is unclear.** Code is Apache-2.0, but the big-lama checkpoint has no explicit weight license. BiRefNet repo is MIT, but weight terms are disputed in HF threads, and BRIA RMBG (a BiRefNet derivative) is **non-commercial**: avoid it. | Defer the final model choice to a license spike before M11. Candidates: BiRefNet official weights (pending confirmation), U²-Net (Apache-2.0), Real-ESRGAN (BSD-3), DeepFilterNet (MIT/Apache dual; verify weights). If LaMa can't be cleared, I'll look for a permissive alternative and won't ship it. |
| 31 | "AI subject select" is a photo feature in M6, but AI tools land in M11. | M6 ships rectangle, ellipse and lasso selections. AI subject select lands in M11. |
| 32 | Stickers in Simple mode have no asset source. | Shape presets plus a small **original** sticker pack (SVG) made in M9. |

### Milestones / acceptance
| # | Issue | Proposed resolution |
|---|---|---|
| 33 **Q** | **M4 is enormous**: keyframes, graph editor, ~13 transitions, text, captions, color pipeline, scopes, LUTs, the effect system and 40 effects. | Split it into **M4a** (keyframes + graph editor + color pipeline + scopes + LUTs + effect system with ~10 effects), **M4b** (text + captions + all transitions), and **M4c** (remaining 30 effects). Each sub-milestone gets its own acceptance and commit. |
| 34 **Q** | The **M9 acceptance** ("captioned reel in <5 min") depends on captions, but auto-captions only arrive in M11. A "new user" test also can't be automated. | M9 accepts with captions typed manually or from template text placeholders, plus a timed scripted e2e. The human usability run is a manual checklist that you perform. The auto-caption variant is re-run after M11. |
| 35 **Q** | M10 (transcript ±100 ms) and M12 (a real 3-minute talking-head clip) need **real speech footage with ground truth**, which synthetic samples can't provide. M12's real run also needs an LLM API key. | Use LibriSpeech (CC BY 4.0) audio with published forced alignments for M10. You provide (or approve a CC0/CC-BY source for) the talking-head video, plus an Anthropic key for M12. Mock-LLM tests cover CI. |
| 36 | The M13 1-hour memory-leak test doesn't belong in `make check`. | Make it a separate `make soak` (nightly). A memory-budget instrumentation hook goes in from M2. |
| 37 | Auth is "JWT, pluggable" with no detail. | Email + password (argon2) with access/refresh JWT, behind an `AuthProvider` interface so OIDC can be added later. |
| 38 | Persistence model. | The whole document is PUT with a version number (optimistic concurrency, 409 on conflict). Autosave is debounced. Snapshots are stored copies. Undo history is not persisted across reloads; I'll list that as a known gap. |

---

## 3. Five biggest technical risks and how the milestone order handles them
1. **Real-time decode, composite performance and memory.** This covers WebCodecs seeking (GOPs), multiple decoders, GPU upload, cache budgets and the 30 fps target. *Handled well:* M2 tackles it first, with perf and frame-exact seek as its acceptance. Short-GOP CFR proxies (#4) lower the risk. I'd add memory-budget telemetry in M2 rather than waiting for M13.
2. **Headless/server rendering and parity.** The parts are codecs in headless Chrome, GPU-less WebGL, fonts, color and SSIM ≥0.98. *Handled poorly:* the spec only tests this in **M8**, eight milestones after the engine design is locked. **Proposal:** M2 adds a minimal `render-page` and a headless-Chrome smoke test that compares one frame against the in-browser render. M4 goldens run in that same headless environment. Problems then show up in month 1, not month 6.
3. **Cross-language correctness.** The chain is Zod → JSON Schema → Pydantic. Python AI code must emit ops that the TS `applyOp` accepts, and migrations have to work in both languages. *Handled:* M0 sets up generation and a check that the generated models match. **Proposal:** add the Node ops CLI (#13) in M3 so the M10–12 Python code has a validator from day one.
4. **GPU vector, text and compositing complexity.** This includes tessellated or SDF shapes with dashes and trim paths, per-glyph animators, masks, mattes, adjustment layers and motion blur all in one graph. *Handled:* M4/M5 come after the core engine, but M4's size is the schedule risk; see the split in #33. The render graph must be designed in M2 with mattes and adjustment layers in mind, not added on later.
5. **AI quality, compute and licensing.** CPU Whisper over 30 minutes of footage, per-frame video segmentation, unclear weight licenses, and the quality of LLM edit plans are all open. *Handled:* AI comes last (M10–12), which is right because it only *emits ops*, so it can't destabilize the core. **Proposal:** do the license audit now (PROGRESS.md) and run a short model spike before M10, so a non-commercial weight is never discovered after integration.

---

## 4. Version and browser-API facts I checked (2026-11-01)
| Spec says / implies | Current fact | Action |
|---|---|---|
| **React 18** | React **19.3.1** is current; 18 only gets maintenance. | **Q:** I recommend 19. Radix, cmdk and Zustand 5 support it. Or keep 18.3 to follow the spec literally. |
| TypeScript (unpinned) | **TS 7.0.2** (Go-native) is `latest`, but **typescript-eslint supports only `<6.1`** (the TS 7 API is expected in 7.1). | Pin **TS 6.0.3** so type-aware ESLint works. Revisit when 7.1 ships. |
| Vite / Vitest / Zod / Zustand / Tailwind / ESLint | Vite 8.3, Vitest 5.0 (browser mode available), Zod **4**.6 (native `z.toJSONSchema`, no zod-to-json-schema needed), Zustand 5, Tailwind **4**.3, ESLint 10. | Use these. Zod 4's native JSON Schema output feeds datamodel-code-generator 0.87, which emits Pydantic v2. |
| Radix UI, cmdk | `radix-ui` 1.8.1 (MIT, active). cmdk 1.1.1 (MIT; last published Aug 2025, stable but quiet). | OK. |
| Mediabunny | 1.65.0, **MPL-2.0** (file-level copyleft, commercially OK). `@mediabunny/aac-encoder` is MPL-2.0. | OK. Record it. |
| **MinIO** | **AGPLv3.** The community edition stopped publishing Docker images (Oct 2025) and is unmaintained or archived (2026). | **Q:** violates CLAUDE.md rule 11. Replace with **SeaweedFS (Apache-2.0)** in docker-compose. Code only talks the S3 API, so any S3 works in production. |
| **Redis** | Redis 8 is licensed as RSALv2 / SSPLv1 / **AGPLv3**. | **Q:** use **Valkey** (BSD-3) instead. It's protocol-compatible with redis-py and RQ. |
| Python 3.11+ | **librosa 1.0 requires ≥3.12.** MediaPipe 1.2 has linux aarch64 and x86_64 wheels. SQLAlchemy 2.1 needs ≥3.11. RQ 3.0. | Use Python **3.12**. |
| Playwright Chromium for server export | Bundled Chromium has no H.264/AAC. Since M139, WebGL fails without a GPU unless `--enable-unsafe-swiftshader` is set. | See #16, #17. |
| WebCodecs AAC encode | Not guaranteed on Chrome for Linux. | See #23. |
| Pitch-preserving speed | No native Web Audio API for it. | signalsmith-stretch 1.3.2 (MIT). |
| Model licenses | faster-whisper MIT · U²-Net Apache-2.0 · Real-ESRGAN BSD-3 · BiRefNet repo MIT (weights disputed) · LaMa code Apache-2.0 (weights unclear) · DeepFilterNet MIT/Apache (verify weights) · MediaPipe Apache-2.0 · PySceneDetect BSD-3 · librosa ISC · OpenCV Apache-2.0 · BRIA RMBG **non-commercial: excluded**. | Record all of these. Confirm the weights before M11. |
| FFmpeg | libx264 makes the build **GPL**, which is fine for server-side use but matters if images are distributed. H.264/AAC patent licensing is a business question, not a code one. | Note it in PROGRESS.md. |
| LLM | Anthropic model id goes in config/env (current: `claude-opus-5-5` / `claude-sonnet-5-5`). Ollama is for dev only. | Decide at M12. |

(The original §5, which covered creating PROGRESS.md, was completed on 2026-11-01 and is removed here.)
