import { describe, expect, it } from "vitest";
import * as z from "zod";
import { Color, Id, IsoUtcDateTime, PropertyPath, TimeUs } from "../src/index.ts";
import { named } from "../src/registry.ts";

describe("primitives", () => {
  it("Id allows url-safe ids and forbids dots, so ids can be path segments", () => {
    expect(Id.safeParse("c_V1-x").success).toBe(true);
    expect(Id.safeParse("a.b").success).toBe(false);
    expect(Id.safeParse("").success).toBe(false);
    expect(Id.safeParse("x".repeat(65)).success).toBe(false);
  });

  it("TimeUs is a non-negative integer", () => {
    expect(TimeUs.safeParse(0).success).toBe(true);
    expect(TimeUs.safeParse(1.5).success).toBe(false);
    expect(TimeUs.safeParse(-1).success).toBe(false);
  });

  it("IsoUtcDateTime accepts toISOString output only", () => {
    expect(IsoUtcDateTime.safeParse(new Date(0).toISOString()).success).toBe(true);
    expect(IsoUtcDateTime.safeParse("2026-11-01T12:00:00Z").success).toBe(true);
    expect(IsoUtcDateTime.safeParse("2026-11-01T12:00:00+02:00").success).toBe(false);
  });

  it("PropertyPath addresses items by id", () => {
    expect(PropertyPath.safeParse("effects.fx_1.params.radius").success).toBe(true);
    expect(PropertyPath.safeParse("effects[0].radius").success).toBe(false);
    expect(PropertyPath.safeParse("a..b").success).toBe(false);
  });

  it("Color channels are bounded to [0, 1]", () => {
    expect(Color.safeParse({ r: 0, g: 0.5, b: 1, a: 1 }).success).toBe(true);
    expect(Color.safeParse({ r: -0.1, g: 0, b: 0, a: 1 }).success).toBe(false);
  });

  it("rejects duplicate schema ids", () => {
    expect(() => named("Color", z.string())).toThrow(/Duplicate schema id: Color/);
  });
});
