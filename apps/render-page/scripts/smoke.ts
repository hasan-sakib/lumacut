/**
 * `make smoke-render`: render real M1 renditions headlessly on both WebGL backends and compare.
 *
 * 1. Frame 137 of the 1080p30 sample must show barcode 137 on each backend (decode + composite).
 * 2. The two backends' pixels are compared (SSIM and largest channel difference). Those numbers are
 *    the cross-backend tolerance for later golden-image tests (pre-M0 review item 18).
 */
import { ssim } from "@lumacut/engine/ssim";
import { maxChannelDiff } from "@lumacut/engine/pixels";
import { decodeBarcodeRgba } from "@lumacut/engine/barcode";
import { frameToUs } from "@lumacut/schema";
import { singleClipProject } from "../src/scenarios.ts";
import { openSession, startServer, type Backend } from "./harness.ts";

const FRAME = 137;

/** Share (%) of pixels whose largest channel difference exceeds a few thresholds, and the mean difference. */
function diffHistogram(a: Uint8Array, b: Uint8Array) {
  const pixels = a.length / 4;
  let over2 = 0;
  let over8 = 0;
  let over32 = 0;
  let total = 0;
  for (let i = 0; i < pixels; i += 1) {
    let d = 0;
    for (let c = 0; c < 3; c += 1)
      d = Math.max(d, Math.abs((a[i * 4 + c] ?? 0) - (b[i * 4 + c] ?? 0)));
    total += d;
    if (d > 2) over2 += 1;
    if (d > 8) over8 += 1;
    if (d > 32) over32 += 1;
  }
  const pct = (n: number) => (n * 100) / pixels;
  return { over2: pct(over2), over8: pct(over8), over32: pct(over32), mean: total / pixels };
}
const MIN_SSIM = 0.99;

interface Capture {
  backend: Backend;
  renderer: string;
  barcode: number | null;
  renderMs: number;
  pixels: Uint8Array;
  width: number;
  height: number;
  diagnostics: number;
}

async function capture(backend: Backend, url: string, id: string, frame: number): Promise<Capture> {
  const session = await openSession(backend, url);
  try {
    const entries = await session.call((api) => api.perfMedia());
    const entry = entries.find((e) => e.id === id);
    if (entry === undefined) throw new Error(`${id} is missing from perf-media.json`);
    const project = singleClipProject(entry);
    const tUs = entry.fps === undefined ? 0 : frameToUs(frame, entry.fps);
    const out = await session.page.evaluate(([p, t]) => window.__lumacut?.render(p, "main", t), [
      project,
      tUs,
    ] as const);
    if (out === undefined) throw new Error("the page has no __lumacut API");
    const pixels = Uint8Array.from(Buffer.from(out.pixelsBase64, "base64"));
    return {
      backend,
      renderer: session.info.renderer,
      barcode: decodeBarcodeRgba(pixels, out.width, out.height, "top-left"),
      renderMs: out.renderMs,
      pixels,
      width: out.width,
      height: out.height,
      diagnostics: out.diagnostics.length,
    };
  } finally {
    await session.close();
  }
}

const server = await startServer();
let failed = false;
try {
  const soft = await capture("swiftshader", server.url, "perf_v1", FRAME);
  const gpu = await capture("gpu", server.url, "perf_v1", FRAME);
  for (const c of [soft, gpu]) {
    console.log(
      `${c.backend.padEnd(11)} ${c.width}×${c.height}  barcode=${String(c.barcode)}  render=${c.renderMs.toFixed(0)} ms  diagnostics=${String(c.diagnostics)}\n            ${c.renderer}`,
    );
    if (c.barcode !== FRAME) {
      console.error(
        `FAIL: ${c.backend} shows barcode ${String(c.barcode)}, expected ${String(FRAME)}`,
      );
      failed = true;
    }
    if (c.diagnostics > 0) {
      console.error(`FAIL: ${c.backend} reported diagnostics`);
      failed = true;
    }
  }
  const similarity = ssim(soft.pixels, gpu.pixels, soft.width, soft.height);
  const diff = maxChannelDiff(soft.pixels, gpu.pixels);
  console.log(
    `\nCross-backend tolerance (SwiftShader vs GPU): SSIM = ${similarity.toFixed(5)}, max channel difference = ${String(diff)}/255`,
  );
  const histogram = diffHistogram(soft.pixels, gpu.pixels);
  console.log(
    `  pixels differing by more than 2: ${histogram.over2.toFixed(3)}%  ·  more than 8: ${histogram.over8.toFixed(3)}%  ·  more than 32: ${histogram.over32.toFixed(4)}%  ·  mean ${histogram.mean.toFixed(4)}`,
  );
  if (similarity < MIN_SSIM) {
    console.error(`FAIL: SSIM ${similarity.toFixed(5)} < ${String(MIN_SSIM)}`);
    failed = true;
  }
  if (/swiftshader/i.test(gpu.renderer)) {
    console.error('FAIL: the "gpu" backend is also running on SwiftShader (no GPU in this Chrome)');
    failed = true;
  }
} finally {
  await server.close();
}
console.log(failed ? "\nsmoke-render FAILED" : "\nsmoke-render passed");
process.exit(failed ? 1 : 0);
