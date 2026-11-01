# Sample media

`make samples` generates deterministic test media into `samples/generated/` (gitignored) using the
worker image's FFmpeg; `make test-samples` verifies every file. `samples/generated/manifest.json`
lists each file with its sha256 and the spec it was generated from.

| File | Purpose |
|---|---|
| `fn_1080p30.mp4` | Frame-exact seek, A/V sync (1 kHz beep at every whole second) |
| `fn_1080p60.mp4`, `fn_720p24.mp4`, `fn_1080x1920_30.mp4` | Frame rates and aspect ratios within v1 limits |
| `fn_1080p2997.mp4` | NTSC rational rate 30000/1001 |
| `long_gop_1080p30.mp4` | Keyframes only every 250 frames (seek stress) |
| `vfr_phone_like.mp4` | Variable frame rate (every 7th frame dropped) for CFR proxy conversion |
| `hevc_1080p30.mp4` | HEVC source |
| `audio_*.wav`, `audio_tone.mp3` | Sync beeps, 120 BPM clicks, silence gaps, MP3 import |
| `img_*` | PNG/JPG/WebP up to 8192 px, PNG with alpha, the 6000×4000 photo for M6 |

## Frame-number pattern

Every video frame shows its frame number and timecode as text, plus a machine-readable barcode in
the bottom 1/12 of the frame: 18 equal cells, white start cell, 16 bits of the frame index (most
significant first, white = 1), black end cell. Decoder: `services/worker/lumacut_worker/samples/barcode.py`.
