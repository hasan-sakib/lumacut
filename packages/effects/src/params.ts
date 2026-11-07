import type { Color, ParamValue, Vec2 } from "@lumacut/schema";

/**
 * How an effect or transition parameter is described. The inspector builds its controls from this
 * (CLAUDE.md rule 8) and `Params` reads the values back for the shader. Stored values follow the
 * schema's `ParamValue`: numbers (also for integers), booleans, strings (enum choices), points
 * and sRGB colours.
 */
interface ParamBase {
  /** Key in `EffectInstance.params`; also the keyframe path segment. */
  id: string;
  label: string;
  description?: string;
}

export interface NumberParam extends ParamBase {
  type: "number" | "int";
  default: number;
  min: number;
  max: number;
  step?: number;
  /** Shown after the value ("px", "°", "%"…). */
  unit?: string;
  /** Stored value × `display` is what is shown (percentages: 100). */
  display?: number;
}
export interface BooleanParam extends ParamBase {
  type: "boolean";
  default: boolean;
}
export interface EnumParam extends ParamBase {
  type: "enum";
  default: string;
  options: readonly { value: string; label: string }[];
}
export interface ColorParam extends ParamBase {
  type: "color";
  default: Color;
}
export interface PointParam extends ParamBase {
  type: "vec2";
  default: Vec2;
  /** Per-axis limits; the point is in 0..1 of the layer unless `unit` says otherwise. */
  min: number;
  max: number;
  step?: number;
  unit?: string;
  display?: number;
}

export type ParamDef = NumberParam | BooleanParam | EnumParam | ColorParam | PointParam;

export const defaultParams = (defs: readonly ParamDef[]): Record<string, ParamValue> =>
  Object.fromEntries(defs.map((d) => [d.id, structuredClone(d.default)]));

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const toLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

/** Linear straight-alpha colour as [r, g, b, a]. */
export type LinearColor = [number, number, number, number];

/**
 * An instance's parameters with the definition's defaults filled in and values clamped to their
 * limits, so a shader never sees a missing or out-of-range number.
 */
export class Params {
  readonly #values: Record<string, ParamValue>;
  readonly #defs: ReadonlyMap<string, ParamDef>;

  constructor(defs: readonly ParamDef[], given: Readonly<Record<string, ParamValue>>) {
    this.#defs = new Map(defs.map((d) => [d.id, d]));
    this.#values = { ...defaultParams(defs), ...given };
  }

  num(id: string): number {
    const def = this.#defs.get(id);
    const v = this.#values[id];
    if (typeof v === "number" && (def?.type === "number" || def?.type === "int")) {
      const clamped = clamp(v, def.min, def.max);
      return def.type === "int" ? Math.round(clamped) : clamped;
    }
    return def?.type === "number" || def?.type === "int" ? def.default : 0;
  }

  bool(id: string): boolean {
    const v = this.#values[id];
    return typeof v === "boolean" ? v : false;
  }

  str(id: string): string {
    const def = this.#defs.get(id);
    const v = this.#values[id];
    if (def?.type === "enum") {
      return typeof v === "string" && def.options.some((o) => o.value === v) ? v : def.default;
    }
    return typeof v === "string" ? v : "";
  }

  /** The index of an enum's current choice (what shaders switch on). */
  choice(id: string): number {
    const def = this.#defs.get(id);
    if (def?.type !== "enum") return 0;
    return Math.max(
      0,
      def.options.findIndex((o) => o.value === this.str(id)),
    );
  }

  vec2(id: string): Vec2 {
    const def = this.#defs.get(id);
    const v = this.#values[id];
    if (Array.isArray(v) && def?.type === "vec2") {
      return [clamp(v[0], def.min, def.max), clamp(v[1], def.min, def.max)];
    }
    return def?.type === "vec2" ? [def.default[0], def.default[1]] : [0, 0];
  }

  /** sRGB colour → linear straight [r, g, b, a]. */
  color(id: string): LinearColor {
    const v = this.#values[id];
    const c =
      typeof v === "object" && !Array.isArray(v) && "r" in v ? v : { r: 0, g: 0, b: 0, a: 1 };
    return [toLinear(c.r), toLinear(c.g), toLinear(c.b), c.a];
  }
}
