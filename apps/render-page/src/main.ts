import { DEFAULT_LIMITS, Engine } from "@lumacut/engine";
import { decodeBarcodeRgba } from "@lumacut/engine/barcode";
import { frameToUs, type Project } from "@lumacut/schema";
import type {
  LumacutApi,
  PageInfo,
  RenderOutput,
  SeekCheckResult,
  SoakOptions,
  BenchmarkOptions,
} from "./api.ts";
import { mediaResolver, runBenchmark, runSoak } from "./bench.ts";
import { mulberry32 } from "./metrics.ts";
import { perfProject, singleClipProject, type PerfMediaEntry } from "./scenarios.ts";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function info(): Promise<PageInfo> {
  const gl = new OffscreenCanvas(1, 1).getContext("webgl2");
  const debug = gl?.getExtension("WEBGL_debug_renderer_info");
  const renderer =
    gl === null
      ? "no WebGL2"
      : String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  return Promise.resolve({
    renderer,
    maxTextureSize: gl === null ? 0 : Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)),
    crossOriginIsolated,
    userAgent: navigator.userAgent,
    textureBudgetBytes: DEFAULT_LIMITS.textureBudgetBytes,
  });
}

async function perfMedia(): Promise<PerfMediaEntry[]> {
  const response = await fetch("/media/perf-media.json");
  if (!response.ok) throw new Error("perf-media.json is missing: run `make perf-media`");
  const manifest = (await response.json()) as { files: PerfMediaEntry[] };
  return manifest.files;
}

async function render(project: Project, compositionId: string, tUs: number): Promise<RenderOutput> {
  const engine = Engine.create({ canvas: new OffscreenCanvas(1, 1), resolver: mediaResolver });
  try {
    engine.setProject(project);
    const result = await engine.renderAt(compositionId, tUs, { readback: true });
    return {
      width: result.width,
      height: result.height,
      renderMs: result.renderMs,
      diagnostics: result.diagnostics,
      pixelsBase64: toBase64(result.pixels),
    };
  } finally {
    await engine.dispose();
  }
}

async function seekCheck(
  entry: PerfMediaEntry,
  seeks: number,
  seed: number,
): Promise<SeekCheckResult> {
  const fps = entry.fps;
  if (entry.kind !== "video" || fps === undefined || entry.durationUs === undefined) {
    throw new Error(`${entry.file} isn't a video`);
  }
  const frames = Math.round((entry.durationUs * fps.num) / (1_000_000 * fps.den));
  const engine = Engine.create({ canvas: new OffscreenCanvas(1, 1), resolver: mediaResolver });
  const random = mulberry32(seed);
  const wrong: SeekCheckResult["wrong"] = [];
  try {
    engine.setProject(singleClipProject(entry));
    for (let i = 0; i < seeks; i += 1) {
      const frame = Math.floor(random() * frames);
      const result = await engine.renderAt("main", frameToUs(frame, fps), { readback: true });
      const shown = decodeBarcodeRgba(result.pixels, result.width, result.height, "top-left");
      if (shown !== frame) wrong.push({ frame, shown });
    }
  } finally {
    await engine.dispose();
  }
  return { file: entry.file, seeks, wrong };
}

const api: LumacutApi = {
  info,
  perfMedia,
  render,
  seekCheck,
  benchmark: async (options: BenchmarkOptions) =>
    runBenchmark(perfProject(await perfMedia()), options),
  soak: async (options: SoakOptions) => runSoak(perfProject(await perfMedia()), options),
};
window.__lumacut = api;
const status = document.getElementById("status");
if (status) status.textContent = "Ready";
