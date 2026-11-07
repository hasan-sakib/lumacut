import { BUILTIN_LUTS } from "@lumacut/engine/color";
import type { Asset, ColorSettings } from "@lumacut/schema";
import { ScrubNumber } from "../inspector/ScrubNumber.tsx";

export interface LutAsset {
  id: string;
  name: string;
  /** Present when the LUT is in the library but not yet in the project: choosing it adds it. */
  addToProject?: Asset;
}

interface LutPickerProps {
  color: ColorSettings;
  /** `.cube` files in the project. */
  assets: readonly LutAsset[];
  onChange: (color: ColorSettings, coalesceKey: string | undefined, add?: Asset) => void;
}

/** Choose a look-up table (a built-in look or an imported .cube) and how strongly it applies. */
export function LutPicker({ color, assets, onChange }: LutPickerProps) {
  const lut = color.lut;
  const missingId =
    lut !== undefined &&
    !BUILTIN_LUTS.some((b) => b.id === lut.lutId) &&
    !assets.some((a) => a.id === lut.lutId)
      ? lut.lutId
      : undefined;
  return (
    <div className="flex flex-col gap-2">
      <label className="grid grid-cols-[6rem_1fr] items-center gap-2 text-xs text-neutral-300">
        <span>Look</span>
        <select
          aria-label="Look-up table"
          value={lut?.lutId ?? ""}
          onChange={(e) => {
            const id = e.target.value;
            if (id === "") {
              const { lut: _removed, ...rest } = color;
              onChange(rest, undefined);
            } else {
              const add = assets.find((a) => a.id === id)?.addToProject;
              onChange(
                { ...color, lut: { lutId: id, intensity: lut?.intensity ?? 1 } },
                undefined,
                add,
              );
            }
          }}
          className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-1 text-neutral-100"
        >
          <option value="">None</option>
          <optgroup label="Built-in looks">
            {BUILTIN_LUTS.map((b) => (
              <option key={b.id} value={b.id} title={b.description}>
                {b.name}
              </option>
            ))}
          </optgroup>
          {assets.length > 0 && (
            <optgroup label="Your .cube files">
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </optgroup>
          )}
          {missingId !== undefined && <option value={missingId}>Missing: {missingId}</option>}
        </select>
      </label>
      {lut !== undefined && (
        <ScrubNumber
          label="Intensity"
          value={lut.intensity * 100}
          unit="%"
          step={1}
          min={0}
          max={100}
          onCommit={(v, source) => {
            onChange(
              { ...color, lut: { ...lut, intensity: v / 100 } },
              source === "type" ? undefined : "lut:intensity",
            );
          }}
        />
      )}
    </div>
  );
}
