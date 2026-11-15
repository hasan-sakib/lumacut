import { projectThumbnail } from "../templates/thumbnails.ts";
import type { BrowserItem } from "./items.ts";
import {
  SAMPLE_AT_US,
  TRANSITION_AT_US,
  effectSample,
  lookSample,
  transitionSample,
} from "./sample-scene.ts";

const WIDTH = 240;

/**
 * A picture of what an item does, drawn by the engine on the sample scene: effects and looks
 * applied to it, transitions caught halfway. Null for things a still can't show (motion presets,
 * audio effects, templates): those get an icon tile.
 */
export function itemThumbnail(item: BrowserItem): Promise<string> | null {
  const id = item.key.slice(item.key.indexOf(":") + 1);
  const key = `browser:${item.key}`;
  switch (item.kind) {
    case "effect":
      return projectThumbnail(key, () => effectSample(id), WIDTH, SAMPLE_AT_US);
    case "look":
      return projectThumbnail(key, () => lookSample(id), WIDTH, SAMPLE_AT_US);
    case "transition":
      return projectThumbnail(key, () => transitionSample(id), WIDTH, TRANSITION_AT_US);
    default:
      return null;
  }
}

/** The icon and tint an item shows when it has no picture (or its picture couldn't be drawn). */
export function itemTile(item: BrowserItem): { icon: string; tint: string } {
  switch (item.kind) {
    case "effect":
      return { icon: EFFECT_ICON[item.category] ?? "effect", tint: "bg-sky-500/15 text-sky-400" };
    case "transition":
      return { icon: "transition", tint: "bg-violet-500/15 text-violet-400" };
    case "look":
      return { icon: "lut", tint: "bg-amber-500/15 text-amber-400" };
    case "audio":
      return {
        icon: AUDIO_ICON[item.category] ?? "audio",
        tint: "bg-emerald-500/15 text-emerald-400",
      };
    case "preset":
      return {
        icon: PRESET_ICON[item.category] ?? "motion",
        tint: "bg-fuchsia-500/15 text-fuchsia-400",
      };
    case "template":
      return { icon: "template", tint: "bg-neutral-800 text-neutral-300" };
  }
}

const EFFECT_ICON: Record<string, string> = {
  "Blur & sharpen": "blur",
  Stylize: "effect",
  Distort: "distort",
  Keying: "key",
  Generate: "generate",
  Utility: "sliders",
  Cinematic: "video",
};

const AUDIO_ICON: Record<string, string> = {
  "EQ & filter": "sliders",
  Dynamics: "dynamics",
  Space: "space",
};

const PRESET_ICON: Record<string, string> = {
  In: "motionIn",
  Out: "motionOut",
  Emphasis: "motion",
  Text: "text",
};
