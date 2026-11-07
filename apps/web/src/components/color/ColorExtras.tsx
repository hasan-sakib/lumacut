import { neutralColor, type Asset, type Clip, type ColorSettings, type Op } from "@lumacut/schema";
import { useState } from "react";
import {
  CURVE_INFO,
  CURVE_NAMES,
  pointsOf,
  withCurve,
  type CurveName,
} from "../../color/curve-model.ts";
import { Section } from "../inspector/Section.tsx";
import { CurveEditor } from "./CurveEditor.tsx";
import { HslPanel } from "./HslPanel.tsx";
import { LutPicker, type LutAsset } from "./LutPicker.tsx";

interface ColorExtrasProps {
  clip: Clip;
  lutAssets: readonly LutAsset[];
  onChange: (op: Op, coalesceKey: string | undefined) => void;
}

/** The colour controls that aren't plain number fields: look-up table, HSL ranges, curves. */
export function ColorExtras({ clip, lutAssets, onChange }: ColorExtrasProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({ lut: true });
  const [curve, setCurve] = useState<CurveName>("master");
  const commit = (color: ColorSettings, key: string | undefined, add?: Asset) => {
    const set: Op = { type: "setProps", clipId: clip.id, props: { color } };
    // A LUT from the library joins the project in the same undo step as the clip using it.
    onChange(
      add === undefined
        ? set
        : { type: "batch", label: "Apply look", ops: [{ type: "addAsset", asset: add }, set] },
      key,
    );
  };
  const section = (id: string, title: string, children: React.ReactNode) => (
    <Section
      id={id}
      title={title}
      open={open[id] === true}
      onToggle={() => {
        setOpen((o) => ({ ...o, [id]: o[id] !== true }));
      }}
      hasAdvanced={false}
      hiddenAdvanced={0}
      advanced={false}
      onToggleAdvanced={() => undefined}
      searching={false}
    >
      {children}
    </Section>
  );
  return (
    <>
      {section(
        "lut",
        "Look-up table",
        <LutPicker color={clip.color} assets={lutAssets} onChange={commit} />,
      )}
      {section("hsl", "Colour ranges (HSL)", <HslPanel color={clip.color} onChange={commit} />)}
      {section(
        "curves",
        "Curves",
        <div className="flex flex-col gap-2">
          <select
            aria-label="Curve"
            value={curve}
            onChange={(e) => {
              setCurve(e.target.value as CurveName);
            }}
            className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-1 text-xs text-neutral-100"
          >
            {CURVE_NAMES.map((n) => (
              <option key={n} value={n} title={CURVE_INFO[n].description}>
                {CURVE_INFO[n].label}
              </option>
            ))}
          </select>
          <CurveEditor
            name={curve}
            points={pointsOf(clip.color, curve)}
            onChange={(points, key) => {
              commit(withCurve(clip.color, curve, points), key);
            }}
          />
          <p className="text-[11px] text-neutral-500">{CURVE_INFO[curve].description}</p>
        </div>,
      )}
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
        }}
        onClick={() => {
          commit(neutralColor(), undefined);
        }}
        className="self-start rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-700"
      >
        Reset colour
      </button>
    </>
  );
}
