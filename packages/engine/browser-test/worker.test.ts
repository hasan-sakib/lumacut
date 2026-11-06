import { createClip, createComposition, createTrack, frameToUs } from "@lumacut/schema";
import { afterEach, describe, expect, it } from "vitest";
import {
  EngineClient,
  RpcError,
  type MediaKind,
  type MediaResolver,
  type PresentedEvent,
} from "../src/index.ts";
import { decodeBarcodeRgba, fixture, fixtureUrl } from "../src/testing/index.ts";
import { projectOf, videoAsset } from "./scene.ts";

const FILE = "fx_30.mp4";
const f = fixture(FILE);

let client: EngineClient | null = null;
afterEach(async () => {
  await client?.dispose().catch(() => undefined);
  client = null;
});

const project = () =>
  projectOf(
    [videoAsset(FILE)],
    [
      createComposition({
        id: "main",
        width: f.width,
        height: f.height,
        tracks: [
          createTrack({
            id: "v",
            kind: "visual",
            clips: [
              createClip({
                id: "c",
                type: "media",
                assetId: FILE,
                outUs: frameToUs(f.frames, f.fps),
              }),
            ],
          }),
        ],
      }),
    ],
  );

async function start(
  resolver?: MediaResolver,
): Promise<{ client: EngineClient; calls: [string, MediaKind][] }> {
  const calls: [string, MediaKind][] = [];
  const counting: MediaResolver = {
    resolve: (assetId, kind) => {
      calls.push([assetId, kind]);
      return (resolver ?? { resolve: (id: string) => Promise.resolve(fixtureUrl(id)) }).resolve(
        assetId,
        kind,
      );
    },
  };
  const canvas = document.createElement("canvas");
  client = await EngineClient.create({ canvas, resolver: counting });
  await client.setProject(project());
  return { client, calls };
}

describe("engine in a Web Worker", () => {
  it("renders frame-exact pictures from the worker's own canvas", async () => {
    const { client: c } = await start();
    for (const n of [0, 17, 59, 119, 3, 60]) {
      const result = await c.renderAt("main", frameToUs(n, f.fps), { readback: true });
      expect(
        decodeBarcodeRgba(result.pixels, result.width, result.height, "top-left"),
        `frame ${String(n)}`,
      ).toBe(n);
    }
  });

  it("asks the page for media URLs (once per asset) instead of fetching them itself", async () => {
    const { client: c, calls } = await start();
    await c.renderAt("main", 0);
    await c.renderAt("main", frameToUs(30, f.fps));
    await c.renderAt("main", frameToUs(90, f.fps));
    expect(calls).toEqual([[FILE, "video"]]);
  });

  it("coalesces playback frame requests: newest wins, nothing renders twice, nothing leaks", async () => {
    const { client: c } = await start();
    const presented: PresentedEvent[] = [];
    c.onPresented((event) => presented.push(event));
    await c.renderAt("main", 0); // warm up the decoder so requests pile up behind real work
    const requests = Array.from({ length: 60 }, (_, i) => frameToUs(i, f.fps));
    for (const t of requests) c.requestFrame("main", t);
    await c.flush();
    await new Promise((resolve) => setTimeout(resolve, 50)); // let the last notification arrive
    expect(presented.length).toBeGreaterThan(0);
    expect(presented.length).toBeLessThan(requests.length); // frames were dropped, not queued
    expect(presented.at(-1)?.tUs).toBe(requests.at(-1)); // ...and the newest one was shown
    const times = presented.map((p) => p.tUs);
    expect(times).toEqual([...times].sort((a, b) => a - b)); // never backwards
    expect(presented.at(-1)?.dropped).toBe(requests.length - presented.length);
    expect((await c.snapshot()).openFrames).toBe(0);
  });

  it("reports render errors for requested frames instead of dying", async () => {
    const { client: c } = await start();
    const errors: string[] = [];
    c.onFrameError((e) => errors.push(e.message));
    c.requestFrame("no-such-composition", 0);
    await c.flush();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(errors).toEqual(['Unknown composition "no-such-composition"']);
    await expect(c.renderAt("main", 0)).resolves.toMatchObject({ width: f.width }); // still alive
  });

  it("returns clear errors across the boundary", async () => {
    const { client: c } = await start();
    await expect(c.renderAt("missing", 0)).rejects.toThrow(RpcError);
    await expect(c.renderAt("missing", 0)).rejects.toThrow('Unknown composition "missing"');
    const loop = projectOf(
      [],
      [
        createComposition({
          id: "a",
          width: 8,
          height: 8,
          tracks: [
            createTrack({
              id: "t",
              kind: "visual",
              clips: [createClip({ id: "n", type: "composition", compositionId: "a" })],
            }),
          ],
        }),
      ],
    );
    await expect(c.setProject(loop)).rejects.toThrow("a → a");
  });

  it("hands back the final statistics on dispose: everything decoded was closed, nothing is held", async () => {
    const { client: c } = await start();
    for (const t of [0, 400_000, 900_000]) await c.renderAt("main", t);
    const final = await c.dispose();
    client = null;
    expect(final.framesOpened).toBeGreaterThan(0);
    expect(final.framesClosed).toBe(final.framesOpened);
    expect(final.openFrames).toBe(0);
    expect(final.iteratorsClosed).toBe(final.iteratorsOpened);
    expect(final.textureCount).toBe(0);
    expect(final.textureBytes).toBe(0);
  });

  it("shuts down cleanly and refuses work afterwards", async () => {
    const { client: c } = await start();
    await c.renderAt("main", 0);
    await c.dispose();
    await expect(c.renderAt("main", 0)).rejects.toThrow("The connection was closed");
    client = null;
  });
});
