import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface FixtureCase {
  file: string;
  name: string;
  value: unknown;
}

export type FixtureKind = "project" | "op";

const FIXTURES_DIR = join(import.meta.dirname, "..", "fixtures");

/** Loads every case in fixtures/<validity>/<kind>/*.json (shared with the Python parity test). */
export function loadFixtures(validity: "valid" | "invalid", kind: FixtureKind): FixtureCase[] {
  const dir = join(FIXTURES_DIR, validity, kind);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .flatMap((file) => {
      const cases = JSON.parse(readFileSync(join(dir, file), "utf8")) as {
        name: string;
        value: unknown;
      }[];
      return cases.map((c) => ({ file, name: c.name, value: c.value }));
    });
}
