# Lumacut — v1 Specification

> **Lumacut**: an AI-powered, browser-based studio for video, motion graphics and photo editing. Pro-level control, easy to use.
> A web-based creative studio for **video editing, motion graphics, and photo editing** in one tool: the depth of Premiere Pro / After Effects / Photoshop, the ease of CapCut, plus an AI system that can edit automatically.
> This document is the source of truth. Build it milestone by milestone (Section 13). If anything is ambiguous or infeasible, stop and ask.

---

## 1. Product vision

People should be able to make **short-form reels, long-form videos, cinematic edits, motion graphics, and edited photos/graphics** in one browser app, with **every manual control a pro expects**, while beginners can still **find everything easily**.

### Three pillars
1. **Power.** Full manual control: multi-track timeline, keyframes on everything, a graph editor, masks, blend modes, nested compositions, color grading, effects, shape and text animation, layers-based photo editing, and audio mixing.
2. **Discoverability.** A user should never have to hunt through menus. Every feature is reachable through search, context, and plain language (Section 5).
3. **AI assistance.** AI can do whole edits (auto-edit) or single tasks (remove background, captions, color match, reframe…). It always produces normal, editable edits, never baked pixels.

### PROGRESS.md format
Claude Code creates and maintains `PROGRESS.md` with these sections:
- **Status:** a table of milestones M0–M13 with state (not started / in progress / done) and date.
- **Current focus:** what is being worked on right now and the next step.
- **Decisions:** dated entries for each architectural or library decision, with the reason.
- **Deviations from spec:** anything built differently from SPEC.md, and why.
- **Known gaps:** unfinished or simplified items, so nothing is silently stubbed.
- **Dependencies & licenses:** every added package and AI model with its license.

### Non-negotiable architecture principles
- **One engine for everything.** Video, motion graphics, and photo projects are all *compositions* rendered by the same renderer. A photo is a composition with a single frame.
- **One action system.** Every feature is defined once in the Action Registry. Menus, toolbar, command palette, shortcuts, context menus, and the AI all use it.
- **One edit path.** Every change, from the UI or the AI, is an Op on the project document. Everything is undoable.
- **AI outputs ops, not pixels** (except generative pixel tools like object removal, which output a *new asset* placed as a layer, so the original is never destroyed).

---

## 2. Scope

### v1 includes
- **Video editor:** multi-track editing, trimming tools (ripple, roll, slip, slide), transitions, speed, text, captions, color grading, effects, audio mixing.
- **Motion graphics:** shape layers, pen tool, text animators, masks, track mattes, nested compositions, graph editor, motion presets, motion blur.
- **Photo editor:** layers, adjustment layers, crop and straighten, selections, masks, basic brush and eraser, filters, text, image export.
- **Two UI modes:** Simple (CapCut-like) and Pro (Premiere/AE-like), working on the same project.
- **Templates:** compositions with replaceable placeholders.
- **AI:** analysis, captions, silence and filler removal, auto-reframe, auto color and shot match, background removal (image and video), object removal (image), image upscaling, audio denoise, auto-edit agent, and "Ask" (natural-language commands).
- **Limits:** up to 1080p60 video, ~30 min of source footage per project, images up to 8192 px on the long side. Latest Chrome and Edge only (WebCodecs + WebGL2 required).

### v2 and later (design for these, don't build them)
Real-time collaboration, 3D layers and camera, time remapping and speed ramps, motion tracking and stabilization, multicam, 4K/HDR, Lottie export, mobile UI, plugin marketplace, generative video, and RAW photo support.

---

## 3. Architecture & repo layout

```
lumacut/
├─ apps/
│  ├─ web/                 # React 18 + TS + Vite: the editor UI (Simple + Pro modes)
│  └─ render-page/         # Headless render page for server export (loads @lumacut/engine)
├─ packages/
│  ├─ schema/              # Zod schemas: Project, Composition, Clip, Ops, Effects, Analysis. Exports JSON Schema.
│  ├─ ops/                 # Pure applyOp(project, op) -> { project, inverse }
│  ├─ engine/              # Deterministic renderer: decode, composite, effects, text, shapes, audio
│  ├─ effects/             # Effect definitions (param schema + GLSL), one folder per effect
│  ├─ actions/             # Action Registry: every user-facing command
│  └─ ui-kit/              # Shared components: param controls auto-generated from schemas, keyframe toggles…
├─ services/
│  ├─ api/                 # FastAPI: auth, projects, assets, templates, jobs, AI endpoints
│  └─ worker/              # FFmpeg pipeline, AI analysis + tools, server export, agent
├─ infra/docker-compose.yml  # postgres, redis, minio, api, worker, web
├─ samples/ · SPEC.md · CLAUDE.md · PROGRESS.md
```

| Concern | Choice |
|---|---|
| Frontend | React 18, TypeScript strict, Vite, Zustand, Tailwind, Radix UI, cmdk (command palette) |
| Decode/encode | WebCodecs + Mediabunny (demux/mux) |
| Rendering | WebGL2 + GLSL in a Web Worker with OffscreenCanvas (abstract the backend so WebGPU can be added) |
| Vector shapes and text | Path geometry via a tessellation/SDF approach; text shaping via the browser canvas or HarfBuzz (wasm) |
| Audio | Web Audio API (AudioWorklet for custom effects; OfflineAudioContext for export) |
| Backend | FastAPI, SQLAlchemy 2, Alembic, Pydantic v2 |
| Infra | PostgreSQL, Redis + RQ, MinIO (S3-compatible) |
| Media | FFmpeg / ffprobe |
| Server export | Playwright Chromium runs `render-page`; raw frames are piped to FFmpeg |
| Schema TS→Python | Zod → JSON Schema → datamodel-code-generator → Pydantic (generated only) |
| Tests | Vitest, Playwright e2e, pytest, ruff, mypy, eslint, prettier |

---

## 4. Data model (`packages/schema`)

All times are **integer microseconds**. Versioned with migrations.

```ts
Project {
  id, schemaVersion, name, kind: "video" | "motion" | "photo",   // kind only sets the default UI
  assets: Asset[],
  compositions: Composition[],
  mainCompositionId,
  meta: { createdAt, updatedAt, aiRuns: AiRunRecord[], templateId? }
}

Composition {
  id, name, width, height, fps, durationUs,   // photo: durationUs = 0 (single frame)
  background, tracks: Track[], markers: Marker[]
}

Track { id, name, kind: "visual" | "audio", muted, locked, hidden, solo, clips: Clip[] }
// In the photo UI and Pro motion UI, each track is shown as a "layer".

Clip {
  id, type: "media" | "text" | "shape" | "solid" | "adjustment" | "composition" | "caption" | "paint",
  assetId?, compositionId?,             // media / nested composition
  startUs, inUs, outUs, speed,
  transform: { x, y, scaleX, scaleY, rotation, anchorX, anchorY, skew },
  opacity, blendMode,                   // normal, multiply, screen, overlay, softLight, add, difference, color, luminosity…
  crop, masks: Mask[], trackMatte?: { sourceClipId, mode: "alpha"|"alphaInverted"|"luma"|"lumaInverted" },
  color: ColorSettings, effects: EffectInstance[],
  audio?: { volume, pan, fadeInUs, fadeOutUs, effects: AudioEffectInstance[] },
  text?: TextData, shape?: ShapeData, paint?: { strokesAssetId },
  motionBlur: { enabled, shutterAngle, samples },
  keyframes: Record<PropertyPath, Keyframe[]>,   // ANY numeric/color/point param is keyframeable
  transitionIn?: TransitionInstance,
  source: "user" | "ai" | "template", aiRunId?, placeholder?: PlaceholderInfo
}

Keyframe {
  tUs, value: number | [number, number] | Color,
  interpolation: "linear" | "bezier" | "hold",
  easeIn?: { influence, speed }, easeOut?: { influence, speed },   // graph-editor handles
  spatialTangents?: { in: [x,y], out: [x,y] }                      // curved motion paths for position
}

Mask { id, path: BezierPath (keyframeable), mode: "add"|"subtract"|"intersect", feather, expansion, opacity, inverted }

ShapeData { items: (Rect | Ellipse | Polygon | Star | Path)[], fill?, stroke?: { color, width, cap, join, dash }, trimPaths?: { start, end, offset }, roundCorners? }

TextData {
  runs: { text, fontFamily, fontWeight, fontSize, color, italic, underline }[],
  align, lineHeight, tracking, stroke?, shadow?, background?, box?: { width, height },
  animators: TextAnimator[]    // AE-style range selectors
}
TextAnimator { unit: "char"|"word"|"line", range: { start, end, offset, shape: "square"|"rampUp"|"rampDown"|"triangle"|"round"|"smooth" }, props: { opacity?, position?, scale?, rotation?, blur?, tracking?, fillColor? } }

ColorSettings {
  exposure, contrast, highlights, shadows, whites, blacks, temperature, tint, saturation, vibrance,
  lift, gamma, gain, offset: [r,g,b],
  curves?: { master, r, g, b, hueVsSat?, hueVsHue?, lumVsSat? },
  hsl?: per-color-range adjustments, lut?: { lutId, intensity }
}

EffectInstance { id, effectId, enabled, params: Record<string, ParamValue> }
```

### Ops (`packages/ops`)
`addComposition, addTrack, removeTrack, reorderTrack, addClip, removeClip, moveClip, trimClip, rippleTrim, rollEdit, slipClip, slideClip, splitClip, rippleDelete, setProps, addKeyframe, updateKeyframe, removeKeyframe, addMask, updateMask, addEffect, updateEffect, removeEffect, reorderEffect, setTransition, precompose, addAsset, batch`

- `applyOp` is pure, returns the inverse op, and validates invariants. `batch` is atomic and counts as one undo step.
- Target near-100% unit coverage.

---

## 5. Discoverability & UX (core differentiator)

The goal: **any feature can be found in under 5 seconds** without knowing where it lives.

### 5.1 Action Registry (`packages/actions`)
Every user-facing feature is an Action:
```ts
Action {
  id: "clip.split", title: "Split clip at playhead",
  description: "Cut the selected clip into two at the playhead.",
  keywords: ["cut", "razor", "divide", "blade"],
  category: "Edit", icon, shortcut?: "S",
  when: (ctx) => boolean,           // context: selection, mode, panel focus
  argsSchema?: ZodSchema,           // so the AI and the palette can supply args
  run: (ctx, args) => Op | Op[]
}
```
The registry generates menus, toolbar items, context menus, the shortcut map, the command palette, the shortcut help overlay, and the **tool list exposed to the AI**. A feature that isn't in the registry doesn't exist.

### 5.2 Ways to find things
- **Command palette (Ctrl/Cmd+K):** fuzzy search over action titles, keywords, effects, presets, templates, and settings, including synonyms ("blur face", "make it slow motion", "remove background"). It shows the shortcut beside each result and runs it in place.
- **Ask box:** natural language ("make the title pop in with a bounce", "warm up the colors"). The AI maps this to actions and args. It always previews the result, and the user applies it.
- **Context-aware inspector:** it shows only the properties of the selected item, grouped into collapsible sections, with a **search field inside the inspector** and a Basic/Advanced toggle per section.
- **Right-click everywhere:** context menus generated from actions whose `when()` is true.
- **Effect & preset browser:** categorized, searchable, with a **live hover preview** on the selected clip, favorites, and recents.
- **Rich tooltips:** name, one-line description, and shortcut on every control.
- **Consistent patterns:** every keyframeable property has the same ◆ toggle, every numeric field supports scrub-drag and typed math (`+10`, `*2`), and every panel has the same header controls.

### 5.3 Two modes, one project
- **Simple mode (CapCut-like):** one main track plus overlay tracks, big friendly buttons (Split, Speed, Text, Filters, Effects, Stickers/Shapes, Audio, Captions, Auto-edit), template-first start screen, 9:16 / 16:9 / 1:1 presets.
- **Pro mode (Premiere/AE-like):** full multi-track timeline, layer-style property twirl-downs, graph editor, masks and mattes, scopes (waveform, vectorscope, histogram), and dockable panels.
- Switching modes never changes the project. Advanced properties set in Pro are kept and shown as an "Advanced settings applied" chip in Simple.

### 5.4 Workspaces
- **Edit:** timeline-focused.
- **Motion:** composition and graph-editor focused.
- **Color:** scopes, wheels, and curves.
- **Audio:** mixer.
- **Photo:** canvas plus layers panel, no timeline.

Workspaces can be saved.

---

## 6. Engine (`packages/engine`)

**Deterministic:** `renderFrame(project, compositionId, tUs)` gives identical output for identical input. No wall clock, and seeded RNG only.

- **Decoding:** Mediabunny + WebCodecs on **proxies** during editing and originals on export. Decoder pool, LRU frame cache with a memory budget, and `VideoFrame.close()` always.
- **Composition rendering:** this is recursive, so nested compositions render to intermediate textures with caching by (compId, t, hash). Tracks composite bottom-to-top. Per clip, the order is: source → crop → masks → color pipeline → effects stack → transform → blend mode → track matte → motion blur (accumulate N sub-frame samples).
- **Color pipeline:** linearize → white balance → exposure → tone (contrast/highlights/shadows/whites/blacks) → lift/gamma/gain/offset → curves and HSL qualifiers → saturation/vibrance → LUT (3D texture, `.cube`) → output transform.
- **Effects:** each effect is a definition in `packages/effects` with a param schema (UI auto-generated), one or more GLSL passes, and golden-image tests. v1 needs at least 40 effects across these categories:
  - **Blur & sharpen:** gaussian, directional, radial, zoom, lens/bokeh, sharpen.
  - **Stylize:** glow, vignette, film grain, chromatic aberration, halftone, posterize, pixelate, edge detect, light leaks (procedural).
  - **Distort:** warp, ripple, wave, twirl, fisheye, mirror, kaleidoscope, displacement.
  - **Keying:** chroma key with spill suppression, luma key.
  - **Generate:** gradient, noise, grid.
  - **Utility:** drop shadow, stroke/outline, inner/outer glow, fill.
  - **Cinematic:** letterbox, anamorphic flare, teal-orange look.
- **Transitions:** cross dissolve, dip to black/white, wipes, slides, push, zoom, spin, blur dissolve, glitch, light flash, whip pan, and morph-cut (simple flow-based, may be v1.5). Each is a shader with params.
- **Shapes:** bezier paths → GPU rendering (tessellation or SDF), with fill, stroke, dashes, trim paths, and rounded corners.
- **Text:** shaped text rasterized and cached per glyph run. Animators are evaluated per character, word, or line.
- **Keyframes:** a shared `evaluate(clip, path, t)` handles bezier temporal easing (AE-style influence/speed) and spatial bezier paths.
- **Photo mode:** large images up to 8192 px with tiles if they exceed max texture size. Paint strokes are stored as vector stroke data plus a raster cache.
- **Audio:** a per-clip graph with gain, pan, and effects (EQ, compressor, limiter, reverb, delay, noise gate, pitch-preserving speed) and keyframed volume. The audio clock drives playback sync.
- **Performance target:** 3 video tracks + 2 text/shape layers + color + 2 effects at 1080p proxy, playing at 30 fps or more on a mid-range laptop.

---

## 7. Editor features (UI in `apps/web`)

### Video (Pro + Simple)
- **Timeline:** multi-track with zoom and scroll, snapping, magnetic main track in Simple mode, ripple/roll/slip/slide/razor tools, linked audio/video with unlink, track headers (mute/solo/lock/hide), markers, in/out points, thumbnails, waveforms, and copy/paste of clips and attributes.
- **Clip properties:** speed with pitch preservation, reverse, freeze frame, fades, transform with on-canvas handles, and crop.
- **Text, titles, and captions:** text editing with styles, captions editable as text, and a caption style library.
- **Scopes:** waveform, RGB parade, vectorscope, histogram.

### Motion graphics
- Shape tools (rectangle, ellipse, polygon, star, pen with bezier editing)
- Text animators
- Masks, with the pen on canvas
- Track mattes
- Precompose
- **Graph editor** (value and speed graphs, easing presets: ease, bounce, elastic, overshoot)
- **Motion preset library** (text in/out, pop, slide, typewriter, glitch, shake, zoom punch), which apply keyframes and can be edited afterwards
- Motion blur toggle
- Motion path display on canvas, with editable spatial tangents

### Photo
- Canvas with zoom and pan, layers panel (reorder, group, blend, opacity, visibility, lock)
- Adjustment layers (all color settings)
- Crop, rotate, straighten, flip, resize canvas
- Selections (rectangle, ellipse, lasso, **AI subject select**) → layer masks
- Brush, eraser, and mask brush
- Filters (the effect library)
- Text and shapes
- **Export:** PNG, JPG, and WebP with quality settings

### Templates
- A template is a composition plus placeholder slots (media, text, color) and metadata.
- **Template picker:** start screen and Simple mode.
- "Replace media" keeps all animation intact.
- **Save as template:** the user marks clips as placeholders.
- v1 ships with 20 original templates across reels, intros, lower thirds, slideshows, and quote cards.

### Global
- Undo/redo history panel, autosave, project versions (snapshots)
- Keyboard shortcut editor
- Asset library with search
- Project settings with aspect presets and the ability to change aspect with auto-reframe

---

## 8. Backend API (`services/api`)

- **Auth:** JWT, pluggable.
- **Assets:** resumable uploads, assets, signed URLs, SSE progress.
- **Projects:** CRUD with optimistic concurrency and snapshots.
- **Templates:** CRUD and placeholder metadata.
- **Jobs:** export, analysis, and AI tools, with progress over SSE.
- **AI endpoints:** these return **proposed ops**, or a new asset plus ops for pixel-generating tools.
- **Contract:** the OpenAPI spec generates the TS client.

---

## 9. Media pipeline (worker)

On upload, the worker:
1. Runs ffprobe.
2. Creates a proxy: ≤ 720p H.264 with short GOP, AAC 48 kHz, faststart.
3. Generates a thumbnail sprite and waveform peaks.
4. For images: normalized copy, preview size, and dimensions.
5. Sends a ready notification.

---

## 10. AI system

### 10.1 Analysis (cached per asset)
| Signal | Implementation |
|---|---|
| Transcript + word timing | faster-whisper (model size via env; CPU OK for dev) |
| Silence and filler words | VAD/RMS plus transcript (configurable filler list, including Bangla) |
| Shot boundaries | PySceneDetect |
| Faces and subject tracking | MediaPipe face detection + smoothed tracker |
| Beats, tempo, and energy | librosa |
| Shot quality | OpenCV blur, shake, and exposure metrics |
| Color stats | Lab mean/std, histograms, white point |
| Emphasis moments | loudness peaks + LLM ranking of transcript sentences |

### 10.2 AI tools (v1)
| Tool | Output | Model notes |
|---|---|---|
| Auto-captions | caption clips (ops) | faster-whisper |
| Silence and filler removal | rippleDelete batch | analysis |
| Auto-reframe | keyframed transform/crop | face/subject tracking + spring smoothing |
| Auto color + shot match | ColorSettings ops | stats + Lab color transfer |
| Background removal (image) | new alpha asset + layer | permissively licensed segmentation model, e.g. BiRefNet / U²-Net (**verify license first**) |
| Background removal (video) | matte asset used as track matte | same model per frame + temporal smoothing |
| Object removal (image) | new inpainted asset as a layer above | LaMa (verify license) |
| Upscale (image) | new asset | Real-ESRGAN (verify license) |
| Audio denoise | new audio asset | DeepFilterNet (verify license) |
| AI subject select | selection mask | same segmentation model |

**Model licensing rule:** before adding any model, record its code and weight licenses in PROGRESS.md. Commercial-use-compatible only. **Do not use AGPL or non-commercial models.**

### 10.3 Auto-edit agent
- **Inputs:** goal text, selected assets, target aspect and duration, and a style preset (`clean-talking-head`, `energetic-social`, `cinematic`, `vlog`, `product-promo`).
- **Pipeline:**
  1. Summarize the analysis into a compact form.
  2. The LLM produces an **EditPlan** (what to keep, emphasis, mood, music, title text) validated with Pydantic.
  3. **Deterministic compilers** turn the EditPlan into ops: cuts snapped to words/beats, motion (punch-ins, Ken Burns, motion presets on titles), transitions, color, captions, and audio ducking.
  4. A validator checks the result, with one LLM repair attempt.
  5. The result is one batch, shown as an "AI run" summary with Apply/Discard, and AI clips are highlighted.

### 10.4 Ask (natural-language commands)
- The LLM gets the current context (selection, mode, a compact project summary) and the **Action Registry as tools**: name, description, and args schema.
- It returns one or more action calls → ops → preview → user applies.
- If a request can't be done, the answer explains how to do it manually and highlights the relevant control (a "show me" spotlight).

### 10.5 LLM layer
- `LLMProvider` interface with Anthropic and OpenAI-compatible implementations (Ollama for free local development).
- Structured output, retries, and timeouts.
- Versioned prompt files, and every run logged in `meta.aiRuns`.

---

## 11. Export

- **Video:** MP4 (H.264 + AAC) at 720p/1080p, 24/25/30/60 fps; WebM optional.
  - **Browser export** (WebCodecs + Mediabunny) for short projects.
  - **Server export** (Playwright + FFmpeg) for long ones.
- **Image:** PNG, JPG, WebP from photo projects or any frame of a video.
- **GIF:** short clips (≤ 15 s) via the server.
- **Audio only:** WAV, MP3.
- **Parity test:** browser vs server frames must have SSIM ≥ 0.98.
- **Loudness:** normalize to -14 LUFS (social) or -23 LUFS (broadcast), user-selectable.

---

## 12. Quality bar

- TypeScript strict, mypy --strict, and no silent stubs; known gaps are listed in PROGRESS.md.
- Every action has a title, description, and keywords. Every effect has a golden test. Every op has unit tests.
- **Accessibility:** keyboard reachable panels, visible focus, ARIA labels on icon buttons.
- Errors are actionable, and backend logs are structured.
- Permissive dependencies only; licenses are noted in PROGRESS.md.

---

## 13. Milestones

Do them in order. Each milestone ends with its acceptance criteria passing, `make check` green, PROGRESS.md updated, and a commit.

| # | Milestone | Done when |
|---|---|---|
| M0 | Scaffold: monorepo, Docker Compose, schema package + JSON Schema + Pydantic gen, `make check`, sample media generator | Stack starts, checks pass, generated models match |
| M1 | Media pipeline + auth + asset library UI | Uploads show thumbs/waveform/duration; images too |
| M2 | Engine core: decode, cache, composite (transform, opacity, blend modes, crop), nested comps, audio playback + sync, frame-accurate seek | Perf target met; frame-number test pattern seeks exactly |
| M3 | Action Registry + ops + command palette + Pro timeline (all trim tools, snapping, markers, linking) + inspector + undo/redo + autosave | e2e: build a 5-clip edit only via the palette, then only via mouse; reload is identical |
| M4 | Keyframes + **graph editor** + transitions (all listed) + text + captions editing + color pipeline + scopes + LUTs + effect system with 40 effects | Golden tests for every effect/transition; keyframe eval unit tests incl. bezier easing |
| M5 | Motion graphics: shapes + pen tool, masks, track mattes, text animators, precompose, motion presets, motion blur, motion paths | e2e: build an animated lower-third from scratch; preset applies editable keyframes |
| M6 | Photo workspace: canvas, layers panel, adjustment layers, crop/straighten, selections→masks, brush/eraser, image export, large images | Edit a 6000 px photo with 5 layers smoothly and export PNG/JPG correctly |
| M7 | Audio: mixer, audio effects, keyframed volume, pitch-preserving speed, loudness metering | Mix of voice + music exports at target LUFS ±1 |
| M8 | Export: video (browser + server), image, GIF, audio + parity test | Files play in VLC/QuickTime; A/V sync; SSIM parity |
| M9 | Simple mode + templates (20) + effect/preset browser with hover preview + workspaces + onboarding + tooltips + inspector search | Usability script: a new user makes a captioned 9:16 reel from a template in < 5 min |
| M10 | AI analysis pipeline | Fixture accuracy checks for transcript timing (±100 ms) and shot cuts |
| M11 | AI tools (10.2) with preview/apply UI | Each tool yields valid, undoable ops/assets; e2e per tool |
| M12 | Auto-edit agent + Ask command system | Mock-LLM snapshot tests deterministic; real run turns a 3-min talking-head into a ~45 s styled reel |
| M13 | Hardening: error/empty/loading states, unsupported-browser screen, memory-leak test (1 h playback), performance pass, README with architecture diagram | All green; no memory growth |
