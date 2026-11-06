import { PlaybackSession, type MediaResolver } from "@lumacut/engine";
import type { Project } from "@lumacut/schema";
import type {
  BenchmarkOptions,
  BenchmarkResult,
  MemorySample,
  SoakOptions,
  SoakResult,
} from "./api.ts";
import { mulberry32, summarize, type PresentedFrame } from "./metrics.ts";
import { PERF_COMPOSITION, PERF_FPS } from "./scenarios.ts";

/** Asset ids are file names under /media (see vite.config.ts). */
export const mediaResolver: MediaResolver = {
  resolve: (assetId) => Promise.resolve(new URL(`/media/${assetId}`, location.href).href),
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function newCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1920;
  canvas.height = 1080;
  document.getElementById("stage")?.replaceChildren(canvas);
  return canvas;
}

interface Run {
  session: PlaybackSession;
  frames: PresentedFrame[];
  diagnostics: Set<string>;
  errors: string[];
  droppedRequests: () => number;
}

async function startSession(project: Project): Promise<Run> {
  const frames: PresentedFrame[] = [];
  const diagnostics = new Set<string>();
  const errors: string[] = [];
  let dropped = 0;
  const session = await PlaybackSession.create({
    canvas: newCanvas(),
    resolver: mediaResolver,
    compositionId: PERF_COMPOSITION,
    callbacks: {
      onChange: () => undefined,
      onFrame: (info) => {
        dropped = info.dropped;
        frames.push({
          wallMs: performance.now(),
          tUs: info.tUs,
          renderMs: info.renderMs,
          offsetUs: info.offsetUs,
        });
        for (const d of info.diagnostics) diagnostics.add(`${d.code}: ${d.message}`);
      },
      onError: (message) => errors.push(message),
    },
  });
  await session.setProject(project);
  return { session, frames, diagnostics, errors, droppedRequests: () => dropped };
}

export async function runBenchmark(
  project: Project,
  options: BenchmarkOptions,
): Promise<BenchmarkResult> {
  const run = await startSession(project);
  const { session } = run;
  const started = performance.now();
  await session.play();
  while (
    performance.now() - started < options.seconds * 1000 + options.warmupMs &&
    session.playing
  ) {
    await sleep(100);
  }
  session.pause();
  const first = run.frames[0];
  const report = summarize(run.frames, options.warmupMs, PERF_FPS);
  const finalStats = await session.dispose();
  return {
    options,
    report,
    droppedRequests: run.droppedRequests(),
    firstFrameMs: first === undefined ? -1 : first.wallMs - started,
    diagnostics: [...run.diagnostics],
    errors: run.errors,
    finalStats,
  };
}

/** Page and worker memory together (needs cross-origin isolation); null when unavailable. */
async function totalMemory(): Promise<number | null> {
  const perf = performance as Performance & {
    measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
  };
  if (perf.measureUserAgentSpecificMemory === undefined || !crossOriginIsolated) return null;
  try {
    return (await perf.measureUserAgentSpecificMemory()).bytes;
  } catch {
    return null;
  }
}

export async function runSoak(project: Project, options: SoakOptions): Promise<SoakResult> {
  const run = await startSession(project);
  const { session } = run;
  await session.play();
  const started = performance.now();
  while (performance.now() - started < options.playSeconds * 1000 && session.playing) {
    await sleep(100);
  }
  session.pause();
  const memoryBefore = await totalMemory();

  const random = mulberry32(options.seed);
  const samples: MemorySample[] = [];
  const sampleEvery = Math.max(1, Math.floor(options.seeks / 8));
  for (let i = 1; i <= options.seeks; i += 1) {
    await session.seek(Math.floor(random() * session.durationUs));
    if (i % sampleEvery === 0 || i === options.seeks) {
      const s = await session.snapshot();
      samples.push({
        atSeek: i,
        textureBytes: s.textureBytes,
        openFrames: s.openFrames,
        openIterators: s.openIterators,
      });
    }
  }
  const memoryAfter = await totalMemory();
  const finalStats = await session.dispose();
  return { options, samples, memoryBefore, memoryAfter, errors: run.errors, finalStats };
}
