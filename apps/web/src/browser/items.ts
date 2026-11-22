import { AUDIO_EFFECTS, EFFECTS, TRANSITIONS } from "@lumacut/effects";
import { BUILTIN_LUTS, LOOK_GROUPS } from "@lumacut/engine/color";
import { MOTION_PRESETS } from "@lumacut/ops";
import { TEMPLATES, CATEGORY_LABEL } from "@lumacut/templates";

export type BrowserKind = "effect" | "transition" | "audio" | "preset" | "look" | "template";

/** Anything the browser and the palette can offer, with the action that applies it. */
export interface BrowserItem {
  /** `effect:blur`, `preset:pop`… (favourites and recents store these). */
  key: string;
  kind: BrowserKind;
  name: string;
  description: string;
  category: string;
  keywords: readonly string[];
  action: { id: string; args: Record<string, unknown> };
  /** Can it be shown on the selected clip before clicking (no lasting side effects)? */
  previewable: boolean;
}

export const KIND_LABEL: Record<BrowserKind, string> = {
  effect: "Effects",
  transition: "Transitions",
  audio: "Audio effects",
  preset: "Motion presets",
  look: "Looks",
  template: "Templates",
};

/** Every effect, transition, audio effect, motion preset, look and template, as browser items. */
export function allItems(): BrowserItem[] {
  return [
    ...EFFECTS.map((e) => ({
      key: `effect:${e.id}`,
      kind: "effect" as const,
      name: e.name,
      description: e.description,
      category: e.category,
      keywords: e.keywords,
      action: { id: "effect.add", args: { effect: e.id } },
      previewable: true,
    })),
    ...TRANSITIONS.map((t) => ({
      key: `transition:${t.id}`,
      kind: "transition" as const,
      name: t.name,
      description: t.description,
      category: "Transitions",
      keywords: t.keywords,
      action: { id: "transition.add", args: { transition: t.id } },
      previewable: true,
    })),
    ...AUDIO_EFFECTS.map((a) => ({
      key: `audio:${a.id}`,
      kind: "audio" as const,
      name: a.name,
      description: a.description,
      category: a.category,
      keywords: a.keywords,
      action: { id: "audio.addEffect", args: { effect: a.id } },
      previewable: false,
    })),
    ...MOTION_PRESETS.map((p) => ({
      key: `preset:${p.id}`,
      kind: "preset" as const,
      name: p.name,
      description: p.description,
      category: p.category,
      keywords: p.keywords,
      action: { id: "preset.apply", args: { preset: p.id } },
      previewable: true,
    })),
    ...[...BUILTIN_LUTS]
      .sort((a, b) => LOOK_GROUPS.indexOf(a.group) - LOOK_GROUPS.indexOf(b.group))
      .map((l) => ({
        key: `look:${l.id}`,
        kind: "look" as const,
        name: l.name,
        description: l.description,
        category: l.group,
        keywords: ["look", "lut", "filter", "grade", l.group.toLowerCase()],
        action: { id: "color.applyLut", args: { look: l.id } },
        previewable: true,
      })),
    ...TEMPLATES.map((t) => ({
      key: `template:${t.id}`,
      kind: "template" as const,
      name: t.name,
      description: t.description,
      category: CATEGORY_LABEL[t.category],
      keywords: [...t.keywords, t.aspect],
      action: { id: "template.use", args: { template: t.id } },
      previewable: false,
    })),
  ];
}

/** A `.cube` file's name without the extension ("Teal grade.cube" → "Teal grade"). */
export const lutName = (fileName: string): string => fileName.replace(/\.cube$/i, "");

/** The category your own LUTs show under. */
export const YOUR_LUTS = "Your LUTs";

/** Your own `.cube` look-up tables (in the project or the library) as look cards. */
export function lutItems(luts: readonly { id: string; name: string }[]): BrowserItem[] {
  return luts.map((l) => ({
    key: `look:${l.id}`,
    kind: "look",
    name: lutName(l.name),
    description: "Your .cube look-up table, added as its own layer.",
    category: YOUR_LUTS,
    keywords: ["look", "lut", "cube", "filter", "grade", "mine", "my", l.name],
    action: { id: "color.applyLut", args: { look: l.id } },
    previewable: true,
  }));
}

/** `items` with your LUT cards placed just before the built-in looks. */
export function withLutItems(
  items: readonly BrowserItem[],
  luts: readonly BrowserItem[],
): BrowserItem[] {
  if (luts.length === 0) return [...items];
  const at = items.findIndex((i) => i.kind === "look");
  return at < 0 ? [...items, ...luts] : [...items.slice(0, at), ...luts, ...items.slice(at)];
}

/** Items whose name, category, description or keywords contain every word typed. */
export function searchItems(items: readonly BrowserItem[], query: string): BrowserItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...items];
  return items.filter((i) => {
    const hay = [i.name, i.category, i.description, ...i.keywords].join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
