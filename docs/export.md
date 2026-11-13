# Export (M8)

| What | Where | How |
| --- | --- | --- |
| MP4 (H.264 + AAC), WebM (VP9 + Opus) | **this browser** (≤ 10 min) or **the server** (≤ 4 h) | browser: WebCodecs via Mediabunny; server: render page in headless Chromium → FFmpeg |
| GIF (≤ 15 s, ≤ 720 px, ≤ 25 fps) | server | FFmpeg `palettegen` / `paletteuse` in one pass |
| MP3 | server | FFmpeg `libmp3lame` (VBR q2) |
| WAV | browser | M7 (`export.audio`) |
| PNG / JPEG / WebP | browser | M6 (`export.image`, tiled) |

## Settings (`packages/engine/src/export/settings.ts`)
`ExportSettings {format, resolution (720p | 1080p | source), fps (24/25/30/60), quality (high |
medium | small), fromUs, toUs, loudness (social −14 | broadcast −23 | none)}`. 720p / 1080p set the
**short** side (a 9:16 video at 1080p is 1080 × 1920); sides are even. Frame `i` shows composition
time `from + round(i·10⁶/fps)` and has timestamp `i/fps`; the mix of the same range starts at 0,
so picture and sound are in sync by construction. The API mirrors the type
(`ExportSettingsIn`) and the worker mirrors `outputSize` / frame count (`jobs/export.py`) — keep them
in step.

## Originals
Exports read the uploaded files (`urls.original`, resolver kind `original`,
`EngineOptions.media = "original"`); a file the browser can't decode (codec, rotation) falls back
to its proxy and the export reports `proxy_used`.

## Browser export
`apps/web/src/export/browser.ts`: the mix is rendered on the page (`renderMix`, offline audio
only exists there), normalised (`normalizeLoudness`), then a dedicated worker
(`engine/src/worker/export.worker.ts`, `VideoExportClient`) runs `exportVideo`: an `Engine` on an
`OffscreenCanvas` of the output size draws each frame (`setView` scales the composition), a
Mediabunny `CanvasSource` encodes it, an `AudioSampleSource` encodes the mix, `BufferTarget` holds
the file (hence the 10-minute limit). `canEncodeVideo/Audio` are checked first. Progress goes to
`stores/exports.ts`; cancel stops between frames.

## Server export
1. `POST /api/exports {projectId, compositionId, settings}`: copies the **saved** project document
   (the editor saves first), creates an `exports` row (Alembic `0003`), enqueues
   `lumacut_worker.jobs.export.run_export` on the `export` queue.
2. The `export-worker` service (same image, `LUMACUT_QUEUES=["export"]`, 1 GB `/dev/shm`) starts
   FFmpeg reading raw RGBA from stdin, and a local server on `127.0.0.1` (`export/server.py`) that
   serves the built render page, proxies media from storage (`/media/<asset>/<kind>`, ranges kept,
   same origin) and takes `POST /frame?i=N` (in order) and `POST /audio` (WAV).
3. Python Playwright opens the page in headless Chromium (SwiftShader WebGL) and calls
   `window.__lumacut.runExport(job)` (`apps/render-page/src/export.ts`), which draws every frame
   with the editor's engine and posts it, then posts the normalised mix.
4. The job muxes (AAC / Opus, picture copied), or makes the GIF / MP3, uploads
   `users/<owner>/exports/<id>/export.<ext>`, and marks the row done. Progress (and cancellation)
   are checked about twice a second as frames arrive; every change is published on
   `lumacut:user:<id>:exports` and relayed as `event: export` on `/api/events`.
5. `GET /api/exports?projectId=`, `GET /api/exports/{id}` (download link when done),
   `POST /api/exports/{id}/cancel`, `DELETE /api/exports/{id}`.

The worker image builds the render page in a Node stage and installs Chromium
(`playwright install --with-deps chromium`).

## UI and actions
Export window (`export.open`, Mod+Shift+E): video, GIF, WAV, MP3, image; for video the size, frame
rate, quality, loudness and where it is made (automatic / browser / server). **Exports** side tab
(`panel.showExports`): server exports with live progress, download, cancel, remove. Actions:
`export.video`, `export.gif`, `export.mp3`, `export.cancel`, `export.image`, `export.audio`.

## Parity
Browser and server draw with the same engine; the parity test (browser vs server frames, SSIM ≥
0.98) is part of the verification pass (`make parity`, not written yet).
