// Writes the JSON Schema bundle generated from the Zod schemas.
// Usage: node scripts/gen-json-schema.ts [outFile]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { serializeJsonSchema } from "../src/json-schema.ts";

const outFile = resolve(process.argv[2] ?? "generated/lumacut.schema.json");
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, serializeJsonSchema());
console.log(`wrote ${outFile}`);
