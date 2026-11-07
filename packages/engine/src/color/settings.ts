import type { ColorSettings } from "@lumacut/schema";

/** True when the grade changes nothing, so the layer can skip the colour pass entirely. */
export function isNeutralColor(color: ColorSettings): boolean {
  const scalars = [
    color.exposure,
    color.contrast,
    color.highlights,
    color.shadows,
    color.whites,
    color.blacks,
    color.temperature,
    color.tint,
    color.saturation,
    color.vibrance,
  ];
  const wheels = [color.lift, color.gamma, color.gain, color.offset].flat();
  const bands =
    color.hsl === undefined ? [] : Object.values(color.hsl).flatMap((b) => Object.values(b));
  return (
    scalars.every((v) => v === 0) &&
    wheels.every((v) => v === 0) &&
    bands.every((v) => v === 0) &&
    !hasCurves(color) &&
    (color.lut === undefined || color.lut.intensity === 0)
  );
}

const IDENTITY_TOLERANCE = 1e-9;

/** Curves count only when a curve isn't the identity (tone curves) / flat 0.5 (hue and luminance curves). */
export function hasCurves(color: ColorSettings): boolean {
  const c = color.curves;
  if (c === undefined) return false;
  const identity = (pts: readonly (readonly [number, number])[], flat: boolean): boolean =>
    pts.every(([x, y]) => Math.abs(y - (flat ? 0.5 : x)) < IDENTITY_TOLERANCE);
  return !(
    identity(c.master, false) &&
    identity(c.r, false) &&
    identity(c.g, false) &&
    identity(c.b, false) &&
    (c.hueVsSat === undefined || identity(c.hueVsSat, true)) &&
    (c.hueVsHue === undefined || identity(c.hueVsHue, true)) &&
    (c.lumVsSat === undefined || identity(c.lumVsSat, true))
  );
}
