import { createClip, identityTransform, centeredTransform } from "@lumacut/schema";
import { describe, expect, it } from "vitest";
import {
  IDENTITY,
  applyToPoint,
  croppedRect,
  invert,
  layerCorners,
  layerMatrix,
  multiply,
  projection,
  rotate,
  scale,
  skewX,
  toMat3,
  translate,
  type Point,
} from "../src/index.ts";

const close = (a: Point, b: Point, digits = 9) => {
  expect(a[0]).toBeCloseTo(b[0], digits);
  expect(a[1]).toBeCloseTo(b[1], digits);
};

describe("affine matrices", () => {
  it("multiply applies the right-hand matrix first", () => {
    const m = multiply(translate(10, 0), scale(2, 2));
    close(applyToPoint(m, [1, 1]), [12, 2]);
    expect(multiply(IDENTITY, m)).toEqual(m);
  });

  it("rotates clockwise on screen (y down)", () => {
    close(applyToPoint(rotate(90), [1, 0]), [0, 1]);
    close(applyToPoint(rotate(90), [0, 1]), [-1, 0]);
    close(applyToPoint(rotate(180), [2, 3]), [-2, -3]);
  });

  it("skews so that a positive angle leans the top edge right", () => {
    const [x, y] = applyToPoint(skewX(45), [0, -1]);
    expect(x).toBeCloseTo(1);
    expect(y).toBeCloseTo(-1);
    close(applyToPoint(skewX(45), [5, 0]), [5, 0]);
  });

  it("inverts, and refuses degenerate matrices", () => {
    const m = layerMatrix({
      ...identityTransform(),
      x: 40,
      y: 30,
      scaleX: 2,
      scaleY: 3,
      rotation: 33,
      skew: 10,
      anchorX: 5,
      anchorY: 6,
    });
    const p: Point = [12.5, -7];
    close(applyToPoint(invert(m), applyToPoint(m, p)), p, 7);
    expect(() => invert(scale(0, 1))).toThrow(RangeError);
  });
});

describe("layerMatrix", () => {
  it("is the identity for a default transform", () => {
    expect(layerMatrix(identityTransform())).toEqual(IDENTITY);
  });

  it("keeps the anchor point exactly at (x, y) whatever the rotation, scale and skew", () => {
    const t = {
      ...identityTransform(),
      x: 300,
      y: 200,
      anchorX: 40,
      anchorY: 25,
      rotation: 77,
      scaleX: 1.7,
      scaleY: 0.4,
      skew: 20,
    };
    close(applyToPoint(layerMatrix(t), [40, 25]), [300, 200]);
  });

  it("scales and rotates about the anchor", () => {
    const t = {
      ...identityTransform(),
      x: 100,
      y: 100,
      anchorX: 10,
      anchorY: 10,
      scaleX: 2,
      scaleY: 2,
    };
    close(applyToPoint(layerMatrix(t), [20, 10]), [120, 100]);
    close(
      applyToPoint(layerMatrix({ ...t, scaleX: 1, scaleY: 1, rotation: 90 }), [20, 10]),
      [100, 110],
    );
  });

  it("centres a layer using centeredTransform", () => {
    const t = centeredTransform({ width: 1920, height: 1080 }, { width: 640, height: 360 });
    const corners = layerCorners(t, 640, 360, { left: 0, top: 0, right: 0, bottom: 0 });
    close(corners[0], [640, 360]);
    close(corners[2], [1280, 720]);
  });
});

describe("crop", () => {
  it("removes fractions from each edge in layer pixels", () => {
    expect(croppedRect(200, 100, { left: 0.1, top: 0.2, right: 0.25, bottom: 0 })).toEqual({
      x: 20,
      y: 20,
      width: 130,
      height: 80,
    });
  });

  it("never goes negative and keeps the anchor reference of the uncropped layer", () => {
    expect(croppedRect(100, 100, { left: 0.7, top: 0, right: 0.7, bottom: 0 }).width).toBe(0);
    const clip = createClip({ id: "c", type: "media" });
    const corners = layerCorners(clip.transform, 200, 100, {
      left: 0.5,
      top: 0,
      right: 0,
      bottom: 0,
    });
    close(corners[0], [100, 0]);
    close(corners[1], [200, 0]);
  });
});

describe("projection / GL export", () => {
  it("maps composition corners to clip space with y up", () => {
    const p = projection(1920, 1080);
    close(applyToPoint(p, [0, 0]), [-1, 1]);
    close(applyToPoint(p, [1920, 1080]), [1, -1]);
    close(applyToPoint(p, [960, 540]), [0, 0]);
  });

  it("exports a column-major mat3", () => {
    expect(Array.from(toMat3([1, 2, 3, 4, 5, 6]))).toEqual([1, 2, 0, 3, 4, 0, 5, 6, 1]);
  });
});
