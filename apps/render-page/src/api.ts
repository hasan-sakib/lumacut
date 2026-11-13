import type { Diagnostic, StatsSnapshot } from "@lumacut/engine";
import type { Project } from "@lumacut/schema";
import type { PlaybackReport } from "./metrics.ts";
import type { ServerExportJob, ServerExportReport } from "./export.ts";
import type { PerfMediaEntry } from "./scenarios.ts";

/** What the page exposes to Playwright scripts as `window.__lumacut`. */
export interface LumacutApi {
  info(): Promise<PageInfo>;
  /** Loads `perf-media.json` (404s if `make perf-media` hasn't run). */
  perfMedia(): Promise<PerfMediaEntry[]>;
  render(project: Project, compositionId: string, tUs: number): Promise<RenderOutput>;
  benchmark(options: BenchmarkOptions): Promise<BenchmarkResult>;
  soak(options: SoakOptions): Promise<SoakResult>;
  /** Frame-exact seek check on a real rendition: `seeks` random frames, each read by barcode. */
  seekCheck(entry: PerfMediaEntry, seeks: number, seed: number): Promise<SeekCheckResult>;
  /** Server export: draw every frame and the mix and POST them to the job (M8). */
  runExport(job: ServerExportJob): Promise<ServerExportReport>;
}

export interface PageInfo {
  /** The WebGL renderer string, e.g. "ANGLE (Apple, ANGLE Metal Renderer: Apple M2, …)". */
  renderer: string;
  maxTextureSize: number;
  crossOriginIsolated: boolean;
  userAgent: string;
  textureBudgetBytes: number;
}

export interface RenderOutput {
  width: number;
  height: number;
  renderMs: number;
  diagnostics: Diagnostic[];
  /** Premultiplied RGBA8, top-left origin, base64. */
  pixelsBase64: string;
}

export interface BenchmarkOptions {
  seconds: number;
  warmupMs: number;
}

export interface BenchmarkResult {
  options: BenchmarkOptions;
  report: PlaybackReport;
  /** Frame requests replaced by newer ones before they rendered (display faster than render). */
  droppedRequests: number;
  firstFrameMs: number;
  diagnostics: string[];
  errors: string[];
  finalStats: StatsSnapshot | null;
}

export interface SoakOptions {
  playSeconds: number;
  seeks: number;
  seed: number;
}

export interface MemorySample {
  atSeek: number;
  textureBytes: number;
  openFrames: number;
  openIterators: number;
}

export interface SoakResult {
  options: SoakOptions;
  samples: MemorySample[];
  /** Page + workers memory (bytes) before and after the seeks, or null where the browser can't say. */
  memoryBefore: number | null;
  memoryAfter: number | null;
  errors: string[];
  finalStats: StatsSnapshot | null;
}

export interface SeekCheckResult {
  file: string;
  seeks: number;
  wrong: { frame: number; shown: number | null }[];
}

declare global {
  interface Window {
    __lumacut?: LumacutApi;
  }
}
