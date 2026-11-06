import { BlendMode } from "@lumacut/schema";
import type { BenchLayer } from "../../engine/bench-project.ts";

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}

function Slider({ label, value, min, max, step, unit = "", onChange }: SliderProps) {
  return (
    <label className="grid grid-cols-[6rem_1fr_4.5rem] items-center gap-2 text-xs text-neutral-300">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => {
          onChange(Number(e.target.value));
        }}
        className="accent-sky-500"
      />
      <output className="text-right font-mono text-neutral-400">
        {Number.isInteger(step) ? value : value.toFixed(2)}
        {unit}
      </output>
    </label>
  );
}

interface LayerControlsProps {
  layer: BenchLayer;
  onChange: (patch: Partial<Omit<BenchLayer, "id" | "assetId">>) => void;
}

/** Live controls for the properties M2 draws: blend, opacity, scale, rotation, crop, position. */
export function LayerControls({ layer, onChange }: LayerControlsProps) {
  const isPicture = layer.kind !== "audio";
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900/60 p-3">
      <h3 className="truncate text-sm font-semibold text-neutral-100">{layer.name}</h3>
      {isPicture && (
        <>
          <label className="grid grid-cols-[6rem_1fr] items-center gap-2 text-xs text-neutral-300">
            <span>Blend mode</span>
            <select
              value={layer.blendMode}
              aria-label="Blend mode"
              onChange={(e) => {
                onChange({ blendMode: BlendMode.parse(e.target.value) });
              }}
              className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-100"
            >
              {BlendMode.options.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </label>
          <Slider
            label="Opacity"
            value={layer.opacity}
            min={0}
            max={1}
            step={0.01}
            onChange={(opacity) => {
              onChange({ opacity });
            }}
          />
          <Slider
            label="Scale"
            value={layer.scale}
            min={0.1}
            max={3}
            step={0.05}
            onChange={(scale) => {
              onChange({ scale });
            }}
          />
          <Slider
            label="Rotation"
            value={layer.rotation}
            min={-180}
            max={180}
            step={1}
            unit="°"
            onChange={(rotation) => {
              onChange({ rotation });
            }}
          />
          <Slider
            label="Offset X"
            value={layer.offsetX}
            min={-1920}
            max={1920}
            step={10}
            unit="px"
            onChange={(offsetX) => {
              onChange({ offsetX });
            }}
          />
          <Slider
            label="Offset Y"
            value={layer.offsetY}
            min={-1080}
            max={1080}
            step={10}
            unit="px"
            onChange={(offsetY) => {
              onChange({ offsetY });
            }}
          />
          {(["left", "top", "right", "bottom"] as const).map((edge) => (
            <Slider
              key={edge}
              label={`Crop ${edge}`}
              value={layer.crop[edge]}
              min={0}
              max={0.9}
              step={0.01}
              onChange={(value) => {
                onChange({ crop: { ...layer.crop, [edge]: value } });
              }}
            />
          ))}
        </>
      )}
      {layer.kind !== "image" && (
        <label className="flex items-center gap-2 text-xs text-neutral-300">
          <input
            type="checkbox"
            checked={layer.audible}
            onChange={(e) => {
              onChange({ audible: e.target.checked });
            }}
            className="accent-sky-500"
          />
          Play this asset's sound
        </label>
      )}
    </div>
  );
}
