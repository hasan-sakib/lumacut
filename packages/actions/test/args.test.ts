import { describe, expect, it } from "vitest";
import * as z from "zod";
import { describeArgs } from "../src/index.ts";

describe("describeArgs", () => {
  it("describes a flat object: strings, numbers, integers, booleans, enums, optionality, bounds", () => {
    const fields = describeArgs(
      z.object({
        label: z.string().describe("Marker label"),
        seconds: z.number().min(0).max(60),
        count: z.int(),
        loud: z.boolean().optional(),
        mode: z.enum(["fast", "slow"]),
      }),
    );
    expect(fields).toEqual([
      { name: "label", kind: "string", optional: false, description: "Marker label" },
      { name: "seconds", kind: "number", optional: false, min: 0, max: 60 },
      { name: "count", kind: "integer", optional: false, min: -9007199254740991, max: 9007199254740991 },
      { name: "loud", kind: "boolean", optional: true },
      { name: "mode", kind: "enum", optional: false, options: ["fast", "slow"] },
    ]);
  });

  it("returns null for anything that isn't a flat object of simple fields", () => {
    expect(describeArgs(z.string())).toBeNull();
    expect(describeArgs(z.object({ nested: z.object({ a: z.string() }) }))).toBeNull();
    expect(describeArgs(z.object({ list: z.array(z.string()) }))).toBeNull();
    expect(describeArgs(z.object({ n: z.number().transform((v) => v) }))).toBeNull();
  });

  it("an empty object has no fields", () => {
    expect(describeArgs(z.object({}))).toEqual([]);
  });
});
