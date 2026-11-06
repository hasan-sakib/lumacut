import type { Op, Project } from "@lumacut/schema";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { OpError, applyOp, validateProject } from "../src/index.ts";
import { SEC, sampleProject } from "./helpers.ts";

const CLIPS = ["c1", "c2", "c3", "a1c", "a2c"];
const TRACKS = ["V1", "V2", "A1"];
const time = fc.integer({ min: 0, max: 8 * SEC });
const delta = fc.integer({ min: -2 * SEC, max: 2 * SEC });
const clipId = fc.constantFrom(...CLIPS);
const edge = fc.constantFrom("start" as const, "end" as const);

let nextId = 0;
const freshId = (): string => `n${String(nextId++)}`;

const arbOp: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ type: fc.constant("trimClip" as const), clipId, edge, toUs: time }),
  fc.record({ type: fc.constant("rippleTrim" as const), clipId, edge, toUs: time }),
  fc.record({ type: fc.constant("slipClip" as const), clipId, deltaUs: delta }),
  fc.record({ type: fc.constant("slideClip" as const), clipId, deltaUs: delta }),
  fc.record({ type: fc.constant("moveClip" as const), clipId, trackId: fc.constantFrom(...TRACKS), startUs: time }),
  fc.record({ type: fc.constant("removeClip" as const), clipId }),
  fc.record({ type: fc.constant("splitClip" as const), clipId, atUs: time }).map((o) => ({ ...o, newClipId: freshId() })),
  fc.record({ type: fc.constant("rollEdit" as const), leftClipId: clipId, rightClipId: clipId, toUs: time }),
  fc
    .record({ type: fc.constant("rippleDelete" as const), compositionId: fc.constant("main"), startUs: time, len: fc.integer({ min: 1, max: 3 * SEC }) })
    .map((o) => ({
      type: o.type,
      compositionId: o.compositionId,
      target: { kind: "range" as const, startUs: o.startUs, endUs: o.startUs + o.len, trackIds: ["V1"] },
    })),
  fc.record({ type: fc.constant("setProps" as const), clipId, props: fc.record({ opacity: fc.double({ min: 0, max: 1, noNaN: true }) }) }),
);

describe("random edit sequences", () => {
  it("every op that succeeds yields a valid project and an exact inverse; undoing all restores the start", () => {
    fc.assert(
      fc.property(fc.array(arbOp, { minLength: 1, maxLength: 12 }), (ops) => {
        const start = sampleProject();
        let project: Project = start;
        const inverses: Op[] = [];
        for (const op of ops) {
          let result;
          try {
            result = applyOp(project, op);
          } catch (error) {
            // Refusals are fine; anything other than an OpError is a bug.
            expect(error).toBeInstanceOf(OpError);
            continue;
          }
          validateProject(result.project);
          expect(applyOp(result.project, result.inverse).project).toEqual(project);
          inverses.push(result.inverse);
          project = result.project;
        }
        for (const inverse of inverses.reverse()) project = applyOp(project, inverse).project;
        expect(project).toEqual(start);
      }),
      { numRuns: 200 },
    );
  });
});
