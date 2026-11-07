import type { ColorSettings } from "@lumacut/schema";
import { useState } from "react";
import { ScrubNumber } from "../inspector/ScrubNumber.tsx";

const BANDS = [
  ["red", "Red", "#ef4444"],
  ["orange", "Orange", "#f97316"],
  ["yellow", "Yellow", "#eab308"],
  ["green", "Green", "#22c55e"],
  ["aqua", "Aqua", "#06b6d4"],
  ["blue", "Blue", "#3b82f6"],
  ["purple", "Purple", "#a855f7"],
  ["magenta", "Magenta", "#ec4899"],
] as const;
type BandName = (typeof BANDS)[number][0];

const neutralBand = () => ({ hue: 0, saturation: 0, luminance: 0 });
export const neutralHsl = (): NonNullable<ColorSettings["hsl"]> => ({
  red: neutralBand(),
  orange: neutralBand(),
  yellow: neutralBand(),
  green: neutralBand(),
  aqua: neutralBand(),
  blue: neutralBand(),
  purple: neutralBand(),
  magenta: neutralBand(),
});

interface HslPanelProps {
  color: ColorSettings;
  onChange: (color: ColorSettings, coalesceKey: string | undefined) => void;
}

/** Pick a colour range, then shift its hue, saturation and brightness (HSL qualifiers). */
export function HslPanel({ color, onChange }: HslPanelProps) {
  const [band, setBand] = useState<BandName>("red");
  const hsl = color.hsl ?? neutralHsl();
  const current = hsl[band];
  const set = (key: "hue" | "saturation" | "luminance", value: number, scrub: boolean) => {
    onChange(
      { ...color, hsl: { ...hsl, [band]: { ...current, [key]: value } } },
      scrub ? `hsl:${band}:${key}` : undefined,
    );
  };
  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Colour range" className="flex flex-wrap gap-1">
        {BANDS.map(([id, label, swatch]) => (
          <button
            key={id}
            type="button"
            aria-pressed={band === id}
            title={`${label} range`}
            aria-label={`${label} range`}
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={() => {
              setBand(id);
            }}
            className={`h-5 w-5 rounded-full border-2 ${band === id ? "border-white" : "border-transparent"}`}
            style={{ backgroundColor: swatch }}
          />
        ))}
      </div>
      <ScrubNumber
        label="Hue"
        value={current.hue * 30}
        unit="°"
        step={1}
        min={-30}
        max={30}
        onCommit={(v, source) => {
          set("hue", v / 30, source !== "type");
        }}
      />
      <ScrubNumber
        label="Saturation"
        value={current.saturation * 100}
        unit="%"
        step={1}
        min={-100}
        max={100}
        onCommit={(v, source) => {
          set("saturation", v / 100, source !== "type");
        }}
      />
      <ScrubNumber
        label="Luminance"
        value={current.luminance * 100}
        unit="%"
        step={1}
        min={-100}
        max={100}
        onCommit={(v, source) => {
          set("luminance", v / 100, source !== "type");
        }}
      />
    </div>
  );
}
