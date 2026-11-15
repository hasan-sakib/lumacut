import type {
  Asset,
  Clip,
  Color,
  Composition,
  Keyframe,
  Op,
  PlaceholderInfo,
  Project,
} from "@lumacut/schema";
import { evenWords } from "./builder.ts";

/** One replaceable slot of a project made from a template. */
export interface Slot {
  slotId: string;
  kind: PlaceholderInfo["kind"];
  label: string;
  clip: Clip;
  compositionId: string;
  /** Media slots: has a picture been put in yet? */
  filled: boolean;
}

/** Every slot of every composition, in layer order, each slot id once (the first clip wins). */
export function projectSlots(project: Project): Slot[] {
  const seen = new Set<string>();
  const out: Slot[] = [];
  for (const comp of project.compositions) {
    for (const track of comp.tracks) {
      for (const clip of track.clips) {
        const p = clip.placeholder;
        if (p === undefined || seen.has(`${comp.id}/${p.slotId}`)) continue;
        seen.add(`${comp.id}/${p.slotId}`);
        out.push({
          slotId: p.slotId,
          kind: p.kind,
          label: p.label,
          clip,
          compositionId: comp.id,
          filled: p.kind !== "media" || clip.type === "media",
        });
      }
    }
  }
  return out;
}

/** The size of the box a media slot covers on its canvas (layer size × scale). */
function slotBox(clip: Clip, comp: Composition, project: Project): { w: number; h: number } {
  let width = comp.width;
  let height = comp.height;
  if (clip.type === "media") {
    const asset = project.assets.find((a) => a.id === clip.assetId);
    const size = asset?.video ?? asset?.image;
    if (size !== undefined) {
      // A filled slot: its visible box is the cropped picture.
      width = size.width * (1 - clip.crop.left - clip.crop.right);
      height = size.height * (1 - clip.crop.top - clip.crop.bottom);
    }
  }
  return {
    w: width * Math.abs(clip.transform.scaleX),
    h: height * Math.abs(clip.transform.scaleY),
  };
}

/**
 * Puts a library picture or video into a media slot, keeping everything the template does with
 * it: timing, effects, masks, opacity, blend and every keyframe. The picture covers the slot's box
 * (cropped to its shape, centred), and each scale value (static and keyframed) is rescaled by the
 * same factor so zooms and pops stay as designed.
 */
export function replaceMediaOps(
  project: Project,
  compositionId: string,
  clip: Clip,
  asset: Asset,
): Op[] {
  const comp = project.compositions.find((c) => c.id === compositionId);
  const size = asset.video ?? asset.image;
  if (comp === undefined || size === undefined) return [];
  const box = slotBox(clip, comp, project);
  const baseX = Math.abs(clip.transform.scaleX) || 1;
  const baseY = Math.abs(clip.transform.scaleY) || 1;
  const cover = Math.max(box.w / size.width, box.h / size.height);
  // Crop the overflow equally from both sides so the visible part is exactly the box.
  const shownW = size.width * cover;
  const shownH = size.height * cover;
  const cropX = Math.max(0, (shownW - box.w) / shownW / 2);
  const cropY = Math.max(0, (shownH - box.h) / shownH / 2);
  const rescale = (v: Keyframe["value"]): Keyframe["value"] =>
    Array.isArray(v) && typeof v[0] === "number" && typeof v[1] === "number"
      ? [(v[0] / baseX) * cover, (v[1] / baseY) * cover]
      : v;
  const keyframes = Object.fromEntries(
    Object.entries(clip.keyframes).map(([path, frames]) => [
      path,
      path === "transform.scale" ? frames.map((k) => ({ ...k, value: rescale(k.value) })) : frames,
    ]),
  );
  const ops: Op[] = [];
  if (!project.assets.some((a) => a.id === asset.id)) ops.push({ type: "addAsset", asset });
  const replaced: Clip = {
    ...clip,
    type: "media",
    assetId: asset.id,
    // A still keeps the slot's length; a video plays from its start for the slot's length.
    inUs: 0,
    outUs:
      asset.kind === "video" && asset.video !== undefined
        ? Math.min(asset.video.durationUs, clip.outUs - clip.inUs)
        : clip.outUs - clip.inUs,
    transform: {
      ...clip.transform,
      anchorX: size.width / 2,
      anchorY: size.height / 2,
      scaleX: Math.sign(clip.transform.scaleX || 1) * cover,
      scaleY: Math.sign(clip.transform.scaleY || 1) * cover,
    },
    crop: { left: cropX, right: cropX, top: cropY, bottom: cropY },
    keyframes,
  };
  const { solid: _solid, ...withoutSolid } = replaced;
  ops.push({ type: "removeClip", clipId: clip.id });
  const track = comp.tracks.find((t) => t.clips.some((c) => c.id === clip.id));
  if (track !== undefined) ops.push({ type: "addClip", trackId: track.id, clip: withoutSolid });
  return ops;
}

/** New words for a text slot (style and animators kept); captions are re-timed evenly. */
export function setTextOps(clip: Clip, text: string): Op[] {
  if (clip.text === undefined) return [];
  if (clip.type === "caption") {
    return [
      {
        type: "setProps",
        clipId: clip.id,
        props: {
          caption: {
            ...(clip.caption ?? { words: [] }),
            words: evenWords(text, clip.outUs - clip.inUs),
          },
        },
      },
    ];
  }
  const [first, ...rest] = clip.text.runs;
  if (first === undefined) return [];
  return [
    {
      type: "setProps",
      clipId: clip.id,
      props: {
        text: {
          ...clip.text,
          runs: [{ ...first, text }, ...rest.map((r) => ({ ...r, text: "" }))],
        },
      },
    },
  ];
}

/** A new colour for a colour slot (a fill or a shape). */
export function setColorOps(clip: Clip, color: Color): Op[] {
  if (clip.type === "solid") {
    return [{ type: "setProps", clipId: clip.id, props: { solid: { color } } }];
  }
  if (clip.type === "shape" && clip.shape !== undefined) {
    return [
      {
        type: "setProps",
        clipId: clip.id,
        props: {
          shape: { ...clip.shape, fill: { color, rule: clip.shape.fill?.rule ?? "nonzero" } },
        },
      },
    ];
  }
  if (clip.text !== undefined) {
    return [
      {
        type: "setProps",
        clipId: clip.id,
        props: { text: { ...clip.text, runs: clip.text.runs.map((r) => ({ ...r, color })) } },
      },
    ];
  }
  return [];
}

/** What a slot currently holds, for the slot panel. */
export function slotText(clip: Clip): string {
  if (clip.type === "caption") return (clip.caption?.words ?? []).map((w) => w.text).join(" ");
  return clip.text?.runs.map((r) => r.text).join("") ?? "";
}

export function slotColor(clip: Clip): Color | undefined {
  if (clip.type === "solid") return clip.solid?.color;
  if (clip.type === "shape") return clip.shape?.fill?.color;
  return clip.text?.runs[0]?.color;
}
