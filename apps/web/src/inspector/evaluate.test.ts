import { describe, expect, it } from "vitest";
import { clampTo, evaluateInput, tidy } from "./evaluate.ts";

const ok = (value: number) => ({ ok: true, value });

describe("evaluateInput", () => {
  it("reads plain numbers, including negatives, decimals and exponents", () => {
    expect(evaluateInput(7, "12")).toEqual(ok(12));
    expect(evaluateInput(7, "-5")).toEqual(ok(-5)); // a minus is a negative number, not a subtraction
    expect(evaluateInput(7, ".5")).toEqual(ok(0.5));
    expect(evaluateInput(7, "1.25")).toEqual(ok(1.25));
    expect(evaluateInput(7, "1e3")).toEqual(ok(1000));
    expect(evaluateInput(7, "  42  ")).toEqual(ok(42));
  });

  it("does relative maths from the current value", () => {
    expect(evaluateInput(100, "+10")).toEqual(ok(110));
    expect(evaluateInput(100, "+ 10")).toEqual(ok(110));
    expect(evaluateInput(100, "*2")).toEqual(ok(200));
    expect(evaluateInput(100, "/4")).toEqual(ok(25));
    expect(evaluateInput(-3, "*-2")).toEqual(ok(6));
    expect(evaluateInput(10, "+-4")).toEqual(ok(6));
  });

  it("ignores a trailing unit", () => {
    expect(evaluateInput(0, "50%")).toEqual(ok(50));
    expect(evaluateInput(0, "45°")).toEqual(ok(45));
    expect(evaluateInput(0, "10px")).toEqual(ok(10));
    expect(evaluateInput(0, "2 s")).toEqual(ok(2));
    expect(evaluateInput(100, "*2x")).toEqual(ok(200));
    expect(evaluateInput(0, "-6 dB")).toEqual(ok(-6));
  });

  it("refuses empty or garbage input with a message that helps", () => {
    for (const text of ["", "   ", "abc", "1..2", "5+5", "*", "/x", "NaN", "Infinity", "1e999"]) {
      const r = evaluateInput(1, text);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message.length).toBeGreaterThan(5);
    }
    expect(evaluateInput(1, "/0")).toEqual({ ok: false, message: "Can't divide by zero." });
    expect(evaluateInput(1e308, "*10")).toMatchObject({ ok: false });
  });
});

describe("clampTo and tidy", () => {
  it("clamps with either limit missing", () => {
    expect(clampTo(5, 0, 3)).toBe(3);
    expect(clampTo(-1, 0, 3)).toBe(0);
    expect(clampTo(2, 0, 3)).toBe(2);
    expect(clampTo(99, undefined, undefined)).toBe(99);
    expect(clampTo(-99, 0)).toBe(0);
  });

  it("removes floating point noise", () => {
    expect(tidy(0.1 + 0.2)).toBe(0.3);
    expect(tidy(1.23456789, 2)).toBe(1.23);
  });
});
