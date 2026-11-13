# Audio (M7)

## Signal path
```
decoded samples ─▶ sample processors ─▶ clip effects (Web Audio nodes) ─▶ clip volume ─▶ clip pan
   (Mediabunny)    stretch · reverse ·    EQ · compressor · limiter ·        (keyframes ×    (keyframes)
                   noise gate              reverb · delay                     fades)
                                                                                   │
                                     ┌─────────────────────────────────────────────┘
                                     ▼
                     track bus (fader, pan, meter) ─▶ master (fader, L/R meters, K-weighted loudness tap) ─▶ out
```
`packages/engine/src/audio/audio-engine.ts` builds this per playback (`start`) and tears it down
on `stop`. It runs on any `BaseAudioContext`: the editor's `AudioContext`, or an
`OfflineAudioContext` for mixdown (`renderMix`), so exports sound like the preview.

* **Audio tracks** play their media clips. **Nested compositions** (on any track) play their own
  audio tracks, recursively, through a bus that carries the nested clip's volume, pan and fades
  (speed 1, forwards only; otherwise a diagnostic). Mute / solo apply per composition.
* **Volume and pan** are keyframeable (`audio.volume`, `audio.pan`, the same ◆ as everything else):
  the engine samples the shared `evaluate()` at 100 Hz into `setValueCurveAtTime` curves. Fades
  are equal-power and multiply into the same curve.
* **Speed:** with *Keep pitch* (`Clip.preservePitch`, default on) a streaming WSOLA time-stretcher
  (`audio/dsp/stretch.ts`, ~40 ms frames, ±12 ms similarity search on the channel sum) changes the
  duration without the pitch; off, the source plays at `playbackRate` (pitch follows).
* **Reverse:** the clip's source range is decoded whole (≤ 10 minutes) and reversed.
* **Faders:** `Track.audio {volume, pan}` and `Composition.audio {volume}` (optional schema fields;
  missing = unity / centre). While a fader is dragged the engine follows live
  (`previewLevel`); letting go saves the value (one undo step).

## Audio effects (`packages/effects/src/audio`)
Definitions like visual effects: `ParamDef` parameters (Inspector rows are generated) and either
`build(context, params)` → native nodes, or `processor(sampleRate, params)` → a streaming sample
processor (run before the native nodes, whatever the order in the list).

| Effect | How |
| --- | --- |
| Equaliser | low cut, low shelf, mid bell, high shelf, high cut (`BiquadFilterNode`s) |
| Compressor | `DynamicsCompressorNode` + make-up gain |
| Limiter | drive + `DynamicsCompressorNode` at 20:1, 1 ms attack, ceiling as threshold |
| Noise gate | JS envelope follower (`gate-dsp.ts`): threshold, attack, hold, release, range, 3 dB hysteresis |
| Reverb | pre-delay + `ConvolverNode` with a **seeded** generated impulse, equal-power dry/wet |
| Delay | `DelayNode` with filtered feedback, equal-power dry/wet |

Effect parameters are not keyframeable yet. Reverb and delay declare a `tail`.

## Loudness (`audio/loudness.ts`)
ITU-R BS.1770-4 / EBU R 128: K-weighting (the libebur128 derivation, any sample rate), energy per
100 ms piece, 400 ms blocks with 75% overlap, absolute gate −70 LUFS, relative gate −10 LU; momentary
(400 ms), short-term (3 s) and integrated loudness; true peak by 4× oversampling (48-tap
windowed-sinc polyphase, only around samples within 8 dB of the sample peak).

* **Live meters** (`AudioEngine.meters()`): peak/RMS per track bus and per master channel from
  `AnalyserNode`s; loudness from a K-weighted tap (`IIRFilterNode`s with the exact coefficients)
  fed into `LoudnessAccumulator` in 100 ms pieces. Polling can drop audio when the page is busy, so
  live numbers are approximate.
* **Exact:** `audio.measureLoudness` renders the whole mix offline and measures it.

## Export (`audio/mix.ts`, `audio/wav.ts`)
`renderMix` (offline, stereo 48 kHz, ≤ 30 minutes in the browser) → `normalizeLoudness(target,
−1 dBTP)`: gain to the target, then a look-ahead peak limiter (`dsp/limiter.ts`) if peaks would
pass the ceiling, then a second gain pass to correct what the limiter took → `encodeWav` (16 or
24-bit PCM, no dither). Actions `export.audio` (target `social` −14, `broadcast` −23, or `none`)
and the Export window's "Audio: WAV".

## UI
* Bottom dock **Mixer** (`panel.showMixer`, Shift+X): strips (meter, fader, pan, mute, solo) and the
  master (L/R meters, fader, live M / S / I, target, "Measure mix", "Export WAV at target").
* Inspector: ◆ on Volume and Pan; *Keep pitch* under Time when speed ≠ 1; **Audio effects** section.
* Effects tab: audio effects list when an audio clip is selected.

## Actions
`audio.addEffect`, `audio.removeEffect`, `audio.toggleEffect`, `audio.moveEffect`,
`audio.setVolume`, `audio.setPan`, `audio.fade`, `clip.setPreservePitch`, `track.setVolume`,
`track.setPan`, `mixer.setMasterVolume`, `panel.showMixer`, `audio.measureLoudness`, `export.audio`.
