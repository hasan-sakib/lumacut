/** The committed engine fixtures (packages/engine/fixtures) and their ground truth. */
import manifestJson from "../../fixtures/manifest.json";

export interface FixtureEntry {
  file: string;
  sha256: string;
  bytes: number;
  width: number;
  height: number;
  fps: { num: number; den: number };
  frames: number;
  /** Keyframe interval for directly encoded fixtures; null for proxy-pipeline ones (0.5 s). */
  gop: number | null;
  via: "pipeline" | "direct";
  hasAudio: boolean;
  /** Seconds at which a 1 kHz beep starts. */
  beepsAtS: number[];
  /** "identity": frame n shows n. Otherwise the barcode each frame actually shows. */
  barcodes: "identity" | number[];
  purpose: string;
}

export const FIXTURES: readonly FixtureEntry[] = (
  manifestJson as unknown as { files: FixtureEntry[] }
).files;

export function fixture(file: string): FixtureEntry {
  const found = FIXTURES.find((f) => f.file === file);
  if (found === undefined) throw new Error(`Unknown fixture "${file}"`);
  return found;
}

/** The barcode frame `n` of the fixture shows. */
export function expectedBarcode(entry: FixtureEntry, frame: number): number {
  return entry.barcodes === "identity" ? frame : (entry.barcodes[frame] ?? -1);
}

/** Served URLs of the fixture files (Vite resolves them in the browser test server). */
const URLS = import.meta.glob<string>("../../fixtures/*.mp4", {
  query: "?url",
  import: "default",
  eager: true,
});

export function fixtureUrl(file: string): string {
  const url = URLS[`../../fixtures/${file}`];
  if (url === undefined) throw new Error(`Fixture file "${file}" is not served`);
  return url;
}
