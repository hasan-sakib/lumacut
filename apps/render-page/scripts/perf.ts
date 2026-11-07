/**
 * `make perf`: the M2 playback gate, measured in installed Chrome on this machine's GPU.
 *
 * Scenario (SPEC §13's subset that M2 can draw): 3 video tracks (1080p30, 1080p60, 720p24
 * renditions) + 2 image overlays, each with transform, opacity and a blend mode, over a 1080p
 * composition, with sound. 20 s of playback after a 1.5 s warm-up.
 *
 * Gates: ≥30 presented fps · p95 render time ≤33 ms · ≤1% of composition frames never shown ·
 * no diagnostics or errors. Then a soak: 20 s of playback and 2000 seeded random seeks, after which
 * every decoded frame must be closed, the texture cache within budget and memory flat.
 * The SwiftShader (CPU) run is reported as a floor and never gated.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { BenchmarkResult, SoakResult } from "../src/api.ts";
import { evaluateGates, type Gate } from "../src/metrics.ts";
import { isSoftwareRenderer, openSession, startServer } from "./harness.ts";

const args = new Set(process.argv.slice(2));
const QUICK = args.has("--quick");
const PLAY_SECONDS = QUICK ? 6 : 20;
const WARMUP_MS = 1500;
const SEEKS = QUICK ? 200 : 2000;
const MEMORY_GROWTH_LIMIT = 100 * 1024 * 1024;

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function describe(label: string, r: BenchmarkResult): void {
  const rep = r.report;
  console.log(`\n${label}`);
  console.log(
    `  presented fps        ${rep.presentedFps.toFixed(1)}   (${String(rep.frames)} frames)`,
  );
  console.log(
    `  render ms            mean ${rep.renderMs.mean.toFixed(1)} · p50 ${rep.renderMs.p50.toFixed(1)} · p95 ${rep.renderMs.p95.toFixed(1)} · max ${rep.renderMs.max.toFixed(1)}`,
  );
  console.log(
    `  composition frames   ${String(rep.coverage.shown)} of ${String(rep.coverage.expected)} shown  (${(rep.coverage.droppedFraction * 100).toFixed(2)}% never shown)`,
  );
  console.log(`  longest gap          ${rep.longestGapMs.toFixed(0)} ms`);
  console.log(
    `  A/V offset           mean ${rep.offsetMsAbs.mean.toFixed(0)} · p95 ${rep.offsetMsAbs.p95.toFixed(0)} ms (includes worker latency)`,
  );
  console.log(`  first frame          ${r.firstFrameMs.toFixed(0)} ms after play`);
  console.log(`  requests replaced    ${String(r.droppedRequests)}`);
}

const server = await startServer();
let failed: boolean;
const report: Record<string, unknown> = {};
try {
  const gpu = await openSession("gpu", server.url);
  console.log(`GPU backend: ${gpu.info.renderer}`);
  console.log(`Browser:     ${gpu.info.userAgent}`);
  if (isSoftwareRenderer(gpu.info.renderer)) {
    console.error(
      "FAIL: this Chrome is rendering WebGL in software, so the perf gate can't be measured.\n" +
        "Try LUMACUT_HEADED=1 make perf, and check chrome://gpu.",
    );
    await gpu.close();
    process.exit(1);
  }
  report.renderer = gpu.info.renderer;
  report.userAgent = gpu.info.userAgent;

  const bench = await gpu.call((api, options) => api.benchmark(options), {
    seconds: PLAY_SECONDS,
    warmupMs: WARMUP_MS,
  });
  describe(`Playback (${String(PLAY_SECONDS)} s, GPU)`, bench);
  report.playback = bench;
  const gates: Gate[] = [
    { name: "presented fps", actual: bench.report.presentedFps, limit: 30, kind: "min" },
    { name: "p95 render ms", actual: bench.report.renderMs.p95, limit: 33, kind: "max" },
    {
      name: "composition frames never shown %",
      actual: bench.report.coverage.droppedFraction * 100,
      limit: 1,
      kind: "max",
    },
    { name: "diagnostics", actual: bench.diagnostics.length, limit: 0, kind: "max" },
    { name: "errors", actual: bench.errors.length, limit: 0, kind: "max" },
    {
      name: "open frames after dispose",
      actual: bench.finalStats?.openFrames ?? -1,
      limit: 0,
      kind: "max",
    },
  ];
  if (bench.diagnostics.length > 0) console.log(`  diagnostics: ${bench.diagnostics.join(" | ")}`);
  if (bench.errors.length > 0) console.log(`  errors: ${bench.errors.slice(0, 3).join(" | ")}`);

  const soak: SoakResult = await gpu.call((api, options) => api.soak(options), {
    playSeconds: PLAY_SECONDS,
    seeks: SEEKS,
    seed: 20261102,
  });
  report.soak = soak;
  const final = soak.finalStats;
  const peakTextures = Math.max(0, ...soak.samples.map((s) => s.textureBytes));
  console.log(
    `\nSoak (${String(PLAY_SECONDS)} s playback + ${String(SEEKS)} random seeks, then dispose)`,
  );
  console.log(
    `  after dispose        opened ${String(final?.framesOpened)} / closed ${String(final?.framesClosed)} frames · open ${String(final?.openFrames)} · iterators ${String(final?.iteratorsOpened)}/${String(final?.iteratorsClosed)}`,
  );
  console.log(`  texture cache peak   ${mb(peakTextures)} of ${mb(gpu.info.textureBudgetBytes)}`);
  const growth =
    soak.memoryBefore === null || soak.memoryAfter === null
      ? null
      : soak.memoryAfter - soak.memoryBefore;
  console.log(
    growth === null
      ? "  memory               not measurable in this browser"
      : `  memory               ${mb(soak.memoryBefore ?? 0)} → ${mb(soak.memoryAfter ?? 0)} (growth ${mb(growth)})`,
  );
  if (soak.errors.length > 0) console.log(`  errors: ${soak.errors.slice(0, 3).join(" | ")}`);
  gates.push(
    { name: "soak open frames", actual: final?.openFrames ?? -1, limit: 0, kind: "max" },
    {
      name: "soak frames opened − closed",
      actual: (final?.framesOpened ?? -1) - (final?.framesClosed ?? 0),
      limit: 0,
      kind: "max",
    },
    {
      name: "soak open iterators",
      actual: (final?.iteratorsOpened ?? -1) - (final?.iteratorsClosed ?? 0),
      limit: 0,
      kind: "max",
    },
    {
      name: "soak texture bytes (peak)",
      actual: peakTextures,
      limit: gpu.info.textureBudgetBytes,
      kind: "max",
    },
    { name: "soak errors", actual: soak.errors.length, limit: 0, kind: "max" },
  );
  if (growth !== null) {
    gates.push({
      name: "soak memory growth bytes",
      actual: growth,
      limit: MEMORY_GROWTH_LIMIT,
      kind: "max",
    });
  }
  await gpu.close();

  const soft = await openSession("swiftshader", server.url);
  const floor = await soft.call((api, options) => api.benchmark(options), {
    seconds: Math.min(PLAY_SECONDS, 8),
    warmupMs: WARMUP_MS,
  });
  describe(`Floor: SwiftShader, CPU WebGL (${soft.info.renderer}) — reported, not gated`, floor);
  report.swiftshaderFloor = floor;
  await soft.close();

  const result = evaluateGates(gates);
  console.log("\nGates");
  for (const g of gates) {
    const ok = g.kind === "min" ? g.actual >= g.limit : g.actual <= g.limit;
    console.log(
      `  ${ok ? "pass" : "FAIL"}  ${g.name}: ${g.actual.toFixed(2)}  (${g.kind === "min" ? "≥" : "≤"} ${String(g.limit)})`,
    );
  }
  report.gates = gates;
  failed = !result.passed;
} finally {
  await server.close();
  const dir = fileURLToPath(new URL("../perf-results/", import.meta.url));
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}latest.json`, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(failed ? "\nperf FAILED" : "\nperf passed");
process.exit(failed ? 1 : 0);
