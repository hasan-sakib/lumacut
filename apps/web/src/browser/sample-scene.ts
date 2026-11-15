import { applyOp } from "@lumacut/ops";
import { createClip, neutralColor, type Clip, type Op, type Project } from "@lumacut/schema";
import { TemplateBuilder, hex } from "@lumacut/templates";
import { newEffectInstance } from "../inspector/effect-ops.ts";
import { addTransitionOp } from "../inspector/transition-ops.ts";
import { addLayerOps } from "../photo/layers.ts";

const WIDTH = 480;
const HEIGHT = 270;
const US = 1_000_000;
const SPAN = { start: 0, end: 1 };

/** When to draw a sample scene: the middle (effects, looks) or the middle of the transition. */
export const SAMPLE_AT_US = US / 2;
export const TRANSITION_AT_US = 2 * US;

/**
 * The picture effects and looks are shown on: flat colour blocks, a circle, a star and two
 * letters, so blurs, edges, distortions and colour changes all have something to act on. Built
 * from shapes and text only (no media files), so it is the same everywhere.
 */
function sampleScene(): Project {
  const b = new TemplateBuilder("Sample", WIDTH, HEIGHT, "#0f172a");
  b.fill("#1d4ed8", SPAN);
  b.rect({ x: 0, y: 170, w: WIDTH, h: 100 }, "#16a34a", SPAN);
  b.rect({ x: 300, y: 40, w: 150, h: 110 }, "#f97316", SPAN, 16);
  b.shape(
    {
      items: [{ kind: "ellipse", id: "e", position: [0, 0], size: [120, 120] }],
      fill: { color: hex("#e11d48"), rule: "nonzero" },
    },
    110,
    95,
    SPAN,
    "Circle",
  );
  b.shape(
    {
      items: [
        {
          kind: "star",
          id: "s",
          position: [0, 0],
          points: 5,
          innerRadius: 26,
          outerRadius: 58,
          innerRoundness: 0,
          outerRoundness: 0,
          rotation: 0,
        },
      ],
      fill: { color: hex("#facc15"), rule: "nonzero" },
    },
    375,
    200,
    SPAN,
    "Star",
  );
  b.text("Aa", 215, 150, SPAN, { font: "Inter", weight: 800, size: 96, color: "#ffffff" });
  return b.build();
}

function apply(project: Project, ops: readonly Op[]): Project {
  let next = project;
  for (const op of ops) next = applyOp(next, op).project;
  return next;
}

/** The sample scene with an adjustment layer over it carrying `clip`'s effects or colour. */
function withAdjustment(extra: Partial<Clip>): Project {
  const project = sampleScene();
  const comp = project.compositions[0];
  if (comp === undefined) throw new Error("The sample scene has no composition.");
  const clip = createClip({
    id: "adjust",
    type: "adjustment",
    startUs: 0,
    inUs: 0,
    outUs: US,
    color: neutralColor(),
    ...extra,
  });
  return apply(project, addLayerOps(comp, clip, "adjust-track", "Adjustment"));
}

/** The sample scene with one effect, at its default settings, over everything. */
export function effectSample(effectId: string): Project {
  return withAdjustment({ effects: [newEffectInstance(effectId, "fx")] });
}

/** The sample scene graded with one built-in look. */
export function lookSample(lookId: string): Project {
  return withAdjustment({ color: { ...neutralColor(), lut: { lutId: lookId, intensity: 1 } } });
}

/** Two plain clips with one transition between them; draw it at `TRANSITION_AT_US` (halfway). */
export function transitionSample(transitionId: string): Project {
  const b = new TemplateBuilder("Transition", WIDTH, HEIGHT, "#000000");
  const first = b.fill("#2563eb", { start: 0, end: 2 });
  const project = b.build();
  const track = project.compositions[0]?.tracks[0];
  if (track === undefined) throw new Error("The transition sample has no track.");
  const second = createClip({
    ...first,
    id: "second",
    startUs: 2 * US,
    solid: { color: hex("#f59e0b") },
  });
  const withSecond = apply(project, [{ type: "addClip", trackId: track.id, clip: second }]);
  const placed = withSecond.compositions[0]?.tracks[0];
  const clip = placed?.clips.find((c) => c.id === second.id);
  if (placed === undefined || clip === undefined) {
    throw new Error("The transition sample lost its second clip.");
  }
  let n = 0;
  const op = addTransitionOp(
    placed,
    clip,
    transitionId,
    () => {
      n += 1;
      return `tr${String(n)}`;
    },
    1,
  );
  if (op === null) throw new Error("The transition doesn't fit the sample clips.");
  return apply(withSecond, [op]);
}
