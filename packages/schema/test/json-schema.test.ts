import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildJsonSchema, serializeJsonSchema } from "../src/json-schema.ts";
import { OP_TYPES, registeredSchemaIds } from "../src/index.ts";

const COMMITTED = join(import.meta.dirname, "..", "generated", "lumacut.schema.json");

interface Bundle {
  $defs: Record<string, { oneOf?: { $ref: string }[]; discriminator?: { propertyName: string } }>;
}

describe("JSON Schema export", () => {
  it("matches the committed generated file (run `make gen-schema` if this fails)", () => {
    expect(readFileSync(COMMITTED, "utf8")).toBe(serializeJsonSchema());
  });

  it("is deterministic", () => {
    expect(serializeJsonSchema()).toBe(serializeJsonSchema());
  });

  it("emits a named definition for every registered schema", () => {
    const bundle = buildJsonSchema() as unknown as Bundle;
    expect(Object.keys(bundle.$defs).sort()).toEqual([...registeredSchemaIds].sort());
  });

  it("exports Op as a discriminated union of every op", () => {
    const op = (buildJsonSchema() as unknown as Bundle).$defs.Op;
    expect(op?.discriminator).toEqual({ propertyName: "type" });
    expect(op?.oneOf).toHaveLength(OP_TYPES.length);
  });
});
