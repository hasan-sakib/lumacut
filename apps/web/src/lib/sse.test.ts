import { describe, expect, it } from "vitest";
import { SseParser } from "./sse.ts";

describe("SseParser", () => {
  it("parses events split across arbitrary chunks, skipping pings", () => {
    const text = 'event: snapshot\ndata: []\n\n: ping\n\nevent: asset\ndata: {"assetId":"a1"}\n\n';
    for (let size = 1; size <= text.length; size += 7) {
      const parser = new SseParser();
      const out = [];
      for (let i = 0; i < text.length; i += size) out.push(...parser.push(text.slice(i, i + size)));
      expect(out).toEqual([
        { event: "snapshot", data: "[]" },
        { event: "asset", data: '{"assetId":"a1"}' },
      ]);
    }
  });

  it("handles CRLF, multi-line data and the default event name", () => {
    const parser = new SseParser();
    expect(parser.push("data: one\r\ndata: two\r\n\r\ndata:x\n\n")).toEqual([
      { event: "message", data: "one\ntwo" },
      { event: "message", data: "x" },
    ]);
  });
});
