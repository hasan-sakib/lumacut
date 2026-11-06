import {
  createClip,
  createComposition,
  createTrack,
  type Clip,
  type Composition,
} from "@lumacut/schema";
import { afterEach, describe, expect, it } from "vitest";
import { CompositionCycleError, CompositionDepthError, MAX_NESTING_DEPTH } from "../src/index.ts";
import { pixelAt } from "../src/testing/index.ts";
import {
  createTestEngine,
  must,
  encode8,
  imageAsset,
  projectOf,
  solidImage,
  type Rgba8,
  type TestEngine,
  type TestImage,
} from "./scene.ts";

let current: TestEngine | null = null;
afterEach(async () => {
  await current?.dispose();
  current = null;
});

const RED: Rgba8 = [255, 0, 0, 255];
const GREEN: Rgba8 = [0, 255, 0, 255];
const BLUE: Rgba8 = [0, 0, 255, 255];
const SIZE = 64;

const red = solidImage("red", 32, 32, RED);
const green = solidImage("green", 32, 32, GREEN);
const topBottom: TestImage = {
  id: "tb",
  width: 32,
  height: 32,
  pixel: (_x, y) => (y < 16 ? RED : BLUE),
};
const IMAGES = [red, green, topBottom];

const media = (id: string, assetId: string, over: Partial<Clip> = {}): Clip =>
  createClip({ id, type: "media", assetId, ...over });
const nest = (id: string, compositionId: string, over: Partial<Clip> = {}): Clip =>
  createClip({ id, type: "composition", compositionId, outUs: 2_000_000, ...over });
const comp = (
  id: string,
  size: number,
  clips: Clip[],
  over: Partial<Composition> = {},
): Composition =>
  createComposition({
    id,
    width: size,
    height: size,
    durationUs: 2_000_000,
    tracks: [createTrack({ id: `${id}-v`, kind: "visual", clips })],
    ...over,
  });

/** child: red for 1 s, then green for 1 s (32x32). */
const child = () =>
  comp("child", 32, [
    media("r", "red", { outUs: 1_000_000 }),
    media("g", "green", { startUs: 1_000_000, outUs: 1_000_000 }),
  ]);

async function setup(compositions: Composition[]) {
  current = await createTestEngine(projectOf(IMAGES.map(imageAsset), compositions, "main"), IMAGES);
  return current;
}

async function colorAt(t: number, x = 10, y = 10, id = "main"): Promise<readonly number[]> {
  const result = await must(current, "a running test engine").engine.renderAt(id, t, {
    readback: true,
  });
  return pixelAt(result.pixels, result.width, x, y);
}

function expectNear(actual: readonly number[], expected: readonly number[], tolerance = 2): void {
  expected.forEach((want, i) => {
    expect(
      Math.abs((actual[i] ?? -999) - want),
      `${actual.join(",")} vs ${expected.join(",")}`,
    ).toBeLessThanOrEqual(tolerance);
  });
}

describe("nested compositions", () => {
  it("renders the child and maps parent time onto child time", async () => {
    await setup([comp("main", SIZE, [nest("n", "child")]), child()]);
    expectNear(await colorAt(0), RED);
    expectNear(await colorAt(1_500_000), GREEN);
    expectNear(await colorAt(10, 50, 50), [0, 0, 0, 255]); // outside the 32x32 child
  });

  it("honours the clip's in point and speed", async () => {
    await setup([
      comp("main", SIZE, [nest("n", "child", { inUs: 1_000_000, outUs: 2_000_000 })]),
      child(),
    ]);
    expectNear(await colorAt(0), GREEN); // starts one second into the child

    await current?.dispose();
    await setup([comp("main", SIZE, [nest("n", "child", { speed: 2 })]), child()]);
    expectNear(await colorAt(400_000), RED); // child time 0.8 s
    expectNear(await colorAt(600_000), GREEN); // child time 1.2 s
  });

  it("applies the nested clip's transform, opacity and blend mode like any layer", async () => {
    const big = { ...createClip({ id: "x", type: "solid" }).transform, scaleX: 2, scaleY: 2 };
    await setup([comp("main", SIZE, [nest("n", "child", { transform: big })]), child()]);
    expectNear(await colorAt(0, 60, 60), RED); // 32 px child scaled to cover 64

    await current?.dispose();
    await setup([comp("main", SIZE, [nest("n", "child", { opacity: 0.5 })]), child()]);
    expectNear(await colorAt(0), [encode8(0.5), 0, 0, 255]);

    await current?.dispose();
    const white = { r: 1, g: 1, b: 1, a: 1 };
    await setup([
      comp("main", SIZE, [media("back", "green"), nest("n", "child", { blendMode: "multiply" })], {
        background: white,
      }),
      child(),
    ]);
    expectNear(await colorAt(0), [0, 0, 0, 255]); // red x green = black
  });

  it("keeps the child's orientation (render targets are stored bottom-up)", async () => {
    await setup([comp("main", SIZE, [nest("n", "inner")]), comp("inner", 32, [media("tb", "tb")])]);
    expectNear(await colorAt(0, 10, 4), RED); // top of the image stays on top
    expectNear(await colorAt(0, 10, 27), BLUE);
  });

  it("nests compositions inside compositions", async () => {
    await setup([
      comp("main", SIZE, [nest("n1", "mid")]),
      comp("mid", 32, [nest("n2", "child")]),
      child(),
    ]);
    expectNear(await colorAt(0), RED);
    expectNear(await colorAt(1_200_000), GREEN);
  });

  it("reuses a nested render at the same time and re-renders when the child changes", async () => {
    const h = await setup([comp("main", SIZE, [nest("n", "child")]), child()]);
    await colorAt(0);
    expect(h.engine.snapshot().nestedRenders).toBe(1);
    await colorAt(0);
    expect(h.engine.snapshot().nestedRenders).toBe(1); // cache hit: no second render
    await colorAt(100_000); // a different instant is a different frame
    expect(h.engine.snapshot().nestedRenders).toBe(2);

    // Swap the child's content: the hash changes, so the cached render is not reused.
    const changed = comp("child", 32, [media("r", "green", { outUs: 2_000_000 })]);
    h.engine.setProject(
      projectOf(
        IMAGES.map(imageAsset),
        [comp("main", SIZE, [nest("n", "child")]), changed],
        "main",
      ),
    );
    expectNear(await colorAt(0), GREEN);
    expect(h.engine.snapshot().nestedRenders).toBe(3);
  });

  it("reports a composition that doesn't exist and carries on", async () => {
    const h = await setup([comp("main", SIZE, [media("under", "red"), nest("n", "ghost")])]);
    const result = await h.engine.renderAt("main", 0, { readback: true });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ clipId: "n", code: "composition_missing", level: "error" }),
    );
    expectNear(pixelAt(result.pixels, SIZE, 10, 10), RED);
  });
});

describe("nesting limits", () => {
  it("rejects a composition that contains itself, naming the path, and keeps the old project", async () => {
    const h = await setup([comp("main", SIZE, [media("c", "red")])]);
    const cyclic = projectOf(IMAGES.map(imageAsset), [
      comp("a", SIZE, [nest("na", "b")]),
      comp("b", SIZE, [nest("nb", "a")]),
    ]);
    expect(() => {
      h.engine.setProject(cyclic);
    }).toThrow(CompositionCycleError);
    expect(() => {
      h.engine.setProject(cyclic);
    }).toThrow("a → b → a");
    expectNear(await colorAt(0), RED); // still renders the previous project

    const selfish = projectOf(IMAGES.map(imageAsset), [comp("a", SIZE, [nest("na", "a")])]);
    expect(() => {
      h.engine.setProject(selfish);
    }).toThrow("a → a");
  });

  it("allows nesting up to the depth limit and refuses deeper", async () => {
    const chain = (length: number): Composition[] =>
      Array.from({ length }, (_, i) =>
        comp(
          `c${String(i)}`,
          8,
          i === length - 1 ? [media("leaf", "red")] : [nest(`n${String(i)}`, `c${String(i + 1)}`)],
        ),
      );
    const h = await setup([comp("main", 8, [media("c", "red")])]);
    h.engine.setProject(projectOf(IMAGES.map(imageAsset), chain(MAX_NESTING_DEPTH)));
    expect(() => {
      h.engine.setProject(projectOf(IMAGES.map(imageAsset), chain(MAX_NESTING_DEPTH + 1)));
    }).toThrow(CompositionDepthError);
  });
});
