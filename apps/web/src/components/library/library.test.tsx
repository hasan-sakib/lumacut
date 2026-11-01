import { describe, expect, it } from "vitest";
import type { AssetOut } from "../../api/client.ts";
import { statusText } from "./StatusBadge.tsx";
import { waveformBars } from "./Waveform.tsx";

const base = { stage: null, progress: 0 } as unknown as AssetOut;

describe("statusText", () => {
  it("always says the state in words", () => {
    expect(statusText({ ...base, status: "uploading" }, undefined)).toBe("Upload paused");
    expect(
      statusText({ ...base, status: "processing", stage: "proxy", progress: 0.42 }, undefined),
    ).toBe("Creating proxy 42%");
    expect(statusText({ ...base, status: "failed" }, undefined)).toBe("Failed");
    const upload = {
      key: "k",
      assetId: "a",
      name: "x",
      size: 200,
      uploadedBytes: 50,
      state: "uploading" as const,
      error: null,
    };
    expect(statusText({ ...base, status: "uploading" }, upload)).toBe("Uploading 25%");
  });
});

describe("waveformBars", () => {
  it("reduces peaks per bucket across channels", () => {
    // 4 pixels, 2 channels: [min,max] L then R per pixel
    const waveform = {
      channels: 2,
      length: 4,
      data: [0, 10, 0, 0, -127, 5, 0, 0, 0, 0, 0, 0, 0, 64, -64, 0],
    };
    expect(waveformBars(waveform, 2).map((v) => Math.round(v * 127))).toEqual([127, 64]);
  });
});
