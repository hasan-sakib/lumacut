import { describe, expect, it } from "vitest";
import { formatBytes, formatDuration, formatPercent } from "./format.ts";

describe("format", () => {
  it.each([
    [0, "0:00"],
    [10_000_000, "0:10"],
    [9_600_000, "0:10"],
    [62_000_000, "1:02"],
    [3_723_000_000, "1:02:03"],
  ])("formatDuration(%i) = %s", (us, text) => {
    expect(formatDuration(us)).toBe(text);
  });

  it("formats bytes and percentages", () => {
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(11_587_838)).toBe("11.6 MB");
    expect(formatBytes(150_000_000)).toBe("150 MB");
    expect(formatPercent(0.426)).toBe("42%");
    expect(formatPercent(1.5)).toBe("100%");
  });
});
