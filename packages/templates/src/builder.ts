import { MOTION_PRESETS, applyOp, presetOps } from "@lumacut/ops";
import {
  createClip,
  createComposition,
  createProject,
  createTrack,
  neutralColor,
  type Clip,
  type Color,
  type Keyframe,
  type Project,
  type ShapeData,
  type TextAnimator,
  type TextData,
  type Track,
} from "@lumacut/schema";

const US = 1_000_000;

/** "#ff3b6b" (or "#ff3b6b80") → a colour. */
export function hex(value: string): Color {
  const v = value.replace("#", "");
  const n = (i: number) => Number.parseInt(v.slice(i, i + 2), 16) / 255;
  return { r: n(0), g: n(2), b: n(4), a: v.length >= 8 ? n(6) : 1 };
}

/** A box on the canvas, in pixels (top-left corner and size). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** When a layer is on screen, in seconds. */
export interface Span {
  start: number;
  end: number;
}

export interface TextStyle {
  font?: string;
  weight?: number;
  size?: number;
  color?: string;
  italic?: boolean;
  align?: TextData["align"];
  lineHeight?: number;
  tracking?: number;
  /** Paragraph width in px (wraps); point text without. */
  width?: number;
  background?: { color: string; padding: number; radius: number };
  shadow?: { color: string; blur: number; offset?: [number, number] };
  stroke?: { color: string; width: number };
}

interface PresetUse {
  clipId: string;
  presetId: string;
  startS?: number;
  durationS?: number;
  intensity?: number;
}

/**
 * Builds a template: every layer is its own track (added bottom to top, in call order), slots are
 * clips with a `placeholder`, motion comes from the ordinary preset generators (so it is all
 * editable keyframes). Ids are short and deterministic; using a template gives everything fresh ids.
 */
export class TemplateBuilder {
  readonly width: number;
  readonly height: number;
  readonly #name: string;
  readonly #background: Color;
  readonly #tracks: Track[] = [];
  readonly #presets: PresetUse[] = [];
  #n = 0;

  constructor(name: string, width: number, height: number, background = "#000000") {
    this.#name = name;
    this.width = width;
    this.height = height;
    this.#background = hex(background);
  }

  id(prefix: string): string {
    this.#n += 1;
    return `${prefix}${String(this.#n)}`;
  }

  #layer(clip: Clip, name: string, kind: Track["kind"] = "visual"): Clip {
    this.#tracks.push(createTrack({ id: this.id("t"), kind, name, clips: [clip] }));
    return clip;
  }

  #timing(span: Span) {
    return {
      startUs: Math.round(span.start * US),
      inUs: 0,
      outUs: Math.round((span.end - span.start) * US),
    };
  }

  /**
   * A media slot: a grey fill standing in for a photo or video until it is replaced. It covers
   * `box` (default: the whole canvas); replacing keeps its motion and fits the picture to cover it.
   */
  mediaSlot(slotId: string, label: string, span: Span, box?: Box, extra: Partial<Clip> = {}): Clip {
    const b = box ?? { x: 0, y: 0, w: this.width, h: this.height };
    return this.#layer(
      createClip({
        id: this.id("c"),
        type: "solid",
        ...this.#timing(span),
        solid: { color: hex("#3a3d45") },
        color: neutralColor(),
        transform: {
          x: b.x + b.w / 2,
          y: b.y + b.h / 2,
          anchorX: this.width / 2,
          anchorY: this.height / 2,
          scaleX: b.w / this.width,
          scaleY: b.h / this.height,
          rotation: 0,
          skew: 0,
        },
        placeholder: { slotId, kind: "media", label },
        source: "template",
        ...extra,
      }),
      label,
    );
  }

  /** A full-canvas colour fill; with `slot`, the colour is a template slot. */
  fill(color: string, span: Span, slot?: { id: string; label: string }): Clip {
    return this.#layer(
      createClip({
        id: this.id("c"),
        type: "solid",
        ...this.#timing(span),
        solid: { color: hex(color) },
        color: neutralColor(),
        source: "template",
        ...(slot === undefined
          ? {}
          : { placeholder: { slotId: slot.id, kind: "color" as const, label: slot.label } }),
      }),
      slot?.label ?? "Background",
    );
  }

  /** A rectangle (rounded with `radius`) covering `box`; with `slot`, its colour is a slot. */
  rect(
    box: Box,
    color: string,
    span: Span,
    radius = 0,
    slot?: { id: string; label: string },
  ): Clip {
    const shape: ShapeData = {
      items: [{ kind: "rect", id: "r", position: [0, 0], size: [box.w, box.h], roundness: radius }],
      fill: { color: hex(color), rule: "nonzero" },
    };
    return this.#layer(
      createClip({
        id: this.id("c"),
        type: "shape",
        ...this.#timing(span),
        shape,
        color: neutralColor(),
        transform: {
          x: box.x + box.w / 2,
          y: box.y + box.h / 2,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          skew: 0,
        },
        source: "template",
        ...(slot === undefined
          ? {}
          : { placeholder: { slotId: slot.id, kind: "color" as const, label: slot.label } }),
      }),
      slot?.label ?? "Shape",
    );
  }

  /** Any shape, centred on (x, y). */
  shape(shape: ShapeData, x: number, y: number, span: Span, name = "Shape"): Clip {
    return this.#layer(
      createClip({
        id: this.id("c"),
        type: "shape",
        ...this.#timing(span),
        shape,
        color: neutralColor(),
        transform: { x, y, anchorX: 0, anchorY: 0, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 },
        source: "template",
      }),
      name,
    );
  }

  /** Text centred on (x, y); with `slot`, the words are a template slot. */
  text(
    words: string,
    x: number,
    y: number,
    span: Span,
    style: TextStyle = {},
    slot?: { id: string; label: string },
    animators: TextAnimator[] = [],
  ): Clip {
    return this.#layer(
      createClip({
        id: this.id("c"),
        type: "text",
        ...this.#timing(span),
        text: textData(words, style, animators),
        color: neutralColor(),
        transform: { x, y, anchorX: 0, anchorY: 0, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 },
        source: "template",
        ...(slot === undefined
          ? {}
          : { placeholder: { slotId: slot.id, kind: "text" as const, label: slot.label } }),
      }),
      slot?.label ?? words.slice(0, 24),
    );
  }

  /** Captions timed evenly over the span (a text slot: replacing the words re-times them). */
  captions(
    words: string,
    y: number,
    span: Span,
    style: TextStyle,
    slot: { id: string; label: string },
  ): Clip {
    const length = Math.round((span.end - span.start) * US);
    return this.#layer(
      createClip({
        id: this.id("c"),
        type: "caption",
        ...this.#timing(span),
        text: textData("", style, []),
        caption: {
          words: evenWords(words, length),
          highlightColor: hex("#ffd60a"),
          maxLines: 2,
          maxCharsPerLine: 22,
        },
        color: neutralColor(),
        transform: {
          x: this.width / 2,
          y,
          anchorX: 0,
          anchorY: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          skew: 0,
        },
        source: "template",
        placeholder: { slotId: slot.id, kind: "text", label: slot.label },
      }),
      slot.label,
    );
  }

  /** An empty audio track for music. */
  audioTrack(name = "Music"): void {
    this.#tracks.push(createTrack({ id: this.id("t"), kind: "audio", name }));
  }

  /** Animate a clip with a motion preset when the template is built. */
  preset(clip: Clip, presetId: string, options: Omit<PresetUse, "clipId" | "presetId"> = {}): void {
    this.#presets.push({ clipId: clip.id, presetId, ...options });
  }

  /** Set keyframes on a clip directly (seconds are clip-local). */
  keys(
    clip: Clip,
    path: string,
    frames: readonly [number, Keyframe["value"]][],
    ease = true,
  ): void {
    clip.keyframes[path] = frames.map(([t, value]) => ({
      tUs: Math.round(t * US),
      value,
      interpolation: "bezier",
      ...(ease
        ? { easeIn: { influence: 50, speed: 0 }, easeOut: { influence: 50, speed: 0 } }
        : {}),
    }));
  }

  build(): Project {
    const end = Math.max(
      0,
      ...this.#tracks.flatMap((t) =>
        t.clips.map((c) => c.startUs + Math.round((c.outUs - c.inUs) / c.speed)),
      ),
    );
    const composition = createComposition({
      id: "main",
      name: this.#name,
      width: this.width,
      height: this.height,
      durationUs: end,
      background: this.#background,
      tracks: this.#tracks,
    });
    let project = createProject({
      id: "template",
      name: this.#name,
      now: "2026-01-01T00:00:00.000Z",
      compositions: [composition],
      mainCompositionId: composition.id,
    });
    let n = 0;
    for (const use of this.#presets) {
      const preset = MOTION_PRESETS.find((p) => p.id === use.presetId);
      const clip = project.compositions[0]?.tracks
        .flatMap((t) => t.clips)
        .find((c) => c.id === use.clipId);
      if (preset === undefined || clip === undefined) {
        throw new Error(
          `Template "${this.#name}": no preset "${use.presetId}" or clip "${use.clipId}".`,
        );
      }
      const ops = presetOps(preset, clip, {
        width: this.width,
        height: this.height,
        ...(use.startS === undefined ? {} : { startUs: Math.round(use.startS * US) }),
        ...(use.durationS === undefined ? {} : { durationUs: Math.round(use.durationS * US) }),
        ...(use.intensity === undefined ? {} : { intensity: use.intensity }),
        newId: () => {
          n += 1;
          return `a${String(n)}`;
        },
      });
      for (const op of ops) project = applyOp(project, op).project;
    }
    return project;
  }
}

export function textData(words: string, style: TextStyle, animators: TextAnimator[]): TextData {
  return {
    runs: [
      {
        text: words,
        fontFamily: style.font ?? "Poppins",
        fontWeight: style.weight ?? 700,
        fontSize: style.size ?? 72,
        color: hex(style.color ?? "#ffffff"),
        italic: style.italic ?? false,
        underline: false,
      },
    ],
    align: style.align ?? "center",
    lineHeight: style.lineHeight ?? 1.15,
    tracking: style.tracking ?? 0,
    animators,
    ...(style.width === undefined
      ? {}
      : { box: { width: style.width, height: (style.size ?? 72) * 6 } }),
    ...(style.background === undefined
      ? {}
      : {
          background: {
            color: hex(style.background.color),
            padding: style.background.padding,
            cornerRadius: style.background.radius,
          },
        }),
    ...(style.shadow === undefined
      ? {}
      : {
          shadow: {
            color: hex(style.shadow.color),
            blur: style.shadow.blur,
            offset: style.shadow.offset ?? [0, 4],
          },
        }),
    ...(style.stroke === undefined
      ? {}
      : { stroke: { color: hex(style.stroke.color), width: style.stroke.width } }),
  };
}

/** Words spread evenly over `lengthUs` (clip-local times). */
export function evenWords(
  text: string,
  lengthUs: number,
): { text: string; startUs: number; endUs: number }[] {
  const words = text.split(/\s+/).filter(Boolean);
  const each = words.length === 0 ? 0 : lengthUs / words.length;
  return words.map((w, i) => ({
    text: w,
    startUs: Math.round(i * each),
    endUs: Math.round((i + 1) * each),
  }));
}
