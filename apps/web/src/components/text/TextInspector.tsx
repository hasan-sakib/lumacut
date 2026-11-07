import { BUNDLED_FONTS } from "@lumacut/engine/text";
import type { Clip, Color, Op, TextAlign, TextData, TextRun } from "@lumacut/schema";
import { useState } from "react";
import { colorToHex, hexToColor } from "../../inspector/effects.ts";
import { textContent, withContent } from "../../text/defaults.ts";
import { ScrubNumber } from "../inspector/ScrubNumber.tsx";
import { Section } from "../inspector/Section.tsx";

interface TextInspectorProps {
  clip: Clip;
  onChange: (op: Op, coalesceKey: string | undefined) => void;
}

const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
const ALIGNS: TextAlign[] = ["left", "center", "right", "justify"];
const SELECT =
  "rounded border border-neutral-700 bg-neutral-950 px-1.5 py-1 text-neutral-100 text-xs";

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Color;
  onChange: (color: Color, scrub: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-[1.25rem_6rem_1fr] items-center gap-2 text-xs">
      <span />
      <span className="text-neutral-300">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          value={colorToHex(value)}
          onChange={(e) => {
            onChange(hexToColor(e.target.value, value.a), true);
          }}
          className="h-6 w-12 cursor-pointer rounded border border-neutral-700 bg-neutral-950"
        />
        <input
          type="range"
          aria-label={`${label} opacity`}
          title="Opacity"
          min={0}
          max={100}
          value={Math.round(value.a * 100)}
          onChange={(e) => {
            onChange({ ...value, a: Number(e.target.value) / 100 }, true);
          }}
          className="flex-1 accent-sky-500"
        />
      </div>
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="grid grid-cols-[1.25rem_6rem_1fr] items-center gap-2 text-xs text-neutral-300">
      <span />
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          onChange(e.target.checked);
        }}
        className="h-4 w-4 accent-sky-500"
      />
    </label>
  );
}

/** Words, font and look of a text or caption clip. Every edit is one `setProps` on the clip's text. */
export function TextInspector({ clip, onChange }: TextInspectorProps) {
  const [open, setOpen] = useState(true);
  const text = clip.text;
  if (text === undefined) return null;
  const first = text.runs[0];
  if (first === undefined) return null;
  const commit = (next: TextData, key?: string) => {
    onChange({ type: "setProps", clipId: clip.id, props: { text: next } }, key);
  };
  const styleAll = (patch: Partial<TextRun>, key?: string) => {
    commit({ ...text, runs: text.runs.map((r) => ({ ...r, ...patch })) }, key);
  };

  return (
    <Section
      id="text"
      title="Text"
      open={open}
      onToggle={() => {
        setOpen((o) => !o);
      }}
      hasAdvanced={false}
      hiddenAdvanced={0}
      advanced={false}
      onToggleAdvanced={() => undefined}
      searching={false}
    >
      {clip.type === "text" && (
        <label className="flex flex-col gap-1 text-xs text-neutral-300">
          <span>Words</span>
          <textarea
            aria-label="Text content"
            rows={3}
            value={textContent(text)}
            onChange={(e) => {
              commit(withContent(text, e.target.value), "text:content");
            }}
            className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-100 outline-none focus:border-sky-500"
          />
        </label>
      )}
      <label className="grid grid-cols-[1.25rem_6rem_1fr] items-center gap-2 text-xs text-neutral-300">
        <span />
        <span>Font</span>
        <select
          aria-label="Font"
          value={first.fontFamily}
          onChange={(e) => {
            styleAll({ fontFamily: e.target.value });
          }}
          className={SELECT}
        >
          {!(first.fontFamily in BUNDLED_FONTS) && (
            <option value={first.fontFamily}>{first.fontFamily} (not bundled)</option>
          )}
          {Object.entries(BUNDLED_FONTS).map(([family, font]) => (
            <option key={family} value={family}>
              {font.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid grid-cols-[1.25rem_6rem_1fr] items-center gap-2 text-xs text-neutral-300">
        <span />
        <span>Weight</span>
        <select
          aria-label="Font weight"
          value={first.fontWeight}
          onChange={(e) => {
            styleAll({ fontWeight: Number(e.target.value) });
          }}
          className={SELECT}
        >
          {WEIGHTS.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </label>
      <ScrubNumber
        label="Size"
        value={first.fontSize}
        unit="px"
        step={1}
        min={4}
        max={1000}
        onCommit={(v, source) => {
          styleAll({ fontSize: v }, source === "type" ? undefined : "text:size");
        }}
      />
      <ColorField
        label="Colour"
        value={first.color}
        onChange={(color, scrub) => {
          styleAll({ color }, scrub ? "text:color" : undefined);
        }}
      />
      <Check
        label="Italic"
        checked={first.italic}
        onChange={(italic) => {
          styleAll({ italic });
        }}
      />
      <Check
        label="Underline"
        checked={first.underline}
        onChange={(underline) => {
          styleAll({ underline });
        }}
      />
      <label className="grid grid-cols-[1.25rem_6rem_1fr] items-center gap-2 text-xs text-neutral-300">
        <span />
        <span>Align</span>
        <select
          aria-label="Text alignment"
          value={text.align}
          onChange={(e) => {
            commit({ ...text, align: e.target.value as TextAlign });
          }}
          className={SELECT}
        >
          {ALIGNS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>
      <ScrubNumber
        label="Line height"
        value={text.lineHeight}
        unit="×"
        step={0.05}
        min={0.5}
        max={4}
        onCommit={(v, source) => {
          commit({ ...text, lineHeight: v }, source === "type" ? undefined : "text:lineHeight");
        }}
      />
      <ScrubNumber
        label="Letter spacing"
        value={text.tracking}
        step={5}
        min={-200}
        max={1000}
        onCommit={(v, source) => {
          commit({ ...text, tracking: v }, source === "type" ? undefined : "text:tracking");
        }}
      />
      <Check
        label="Paragraph box"
        checked={text.box !== undefined}
        onChange={(on) => {
          const { box: _removed, ...rest } = text;
          commit(on ? { ...rest, box: { width: 800, height: 300 } } : rest);
        }}
      />
      {text.box !== undefined && (
        <>
          <ScrubNumber
            label="Box width"
            value={text.box.width}
            unit="px"
            step={5}
            min={20}
            max={8000}
            onCommit={(v, source) => {
              if (text.box !== undefined)
                commit(
                  { ...text, box: { ...text.box, width: v } },
                  source === "type" ? undefined : "text:boxw",
                );
            }}
          />
          <ScrubNumber
            label="Box height"
            value={text.box.height}
            unit="px"
            step={5}
            min={20}
            max={8000}
            onCommit={(v, source) => {
              if (text.box !== undefined)
                commit(
                  { ...text, box: { ...text.box, height: v } },
                  source === "type" ? undefined : "text:boxh",
                );
            }}
          />
        </>
      )}
      <Check
        label="Outline"
        checked={text.stroke !== undefined}
        onChange={(on) => {
          const { stroke: _removed, ...rest } = text;
          commit(on ? { ...rest, stroke: { color: { r: 0, g: 0, b: 0, a: 1 }, width: 4 } } : rest);
        }}
      />
      {text.stroke !== undefined && (
        <>
          <ColorField
            label="Outline colour"
            value={text.stroke.color}
            onChange={(color, scrub) => {
              if (text.stroke !== undefined)
                commit(
                  { ...text, stroke: { ...text.stroke, color } },
                  scrub ? "text:strokeColor" : undefined,
                );
            }}
          />
          <ScrubNumber
            label="Outline width"
            value={text.stroke.width}
            unit="px"
            step={0.5}
            min={0}
            max={100}
            onCommit={(v, source) => {
              if (text.stroke !== undefined)
                commit(
                  { ...text, stroke: { ...text.stroke, width: v } },
                  source === "type" ? undefined : "text:strokeW",
                );
            }}
          />
        </>
      )}
      <Check
        label="Shadow"
        checked={text.shadow !== undefined}
        onChange={(on) => {
          const { shadow: _removed, ...rest } = text;
          commit(
            on
              ? {
                  ...rest,
                  shadow: { color: { r: 0, g: 0, b: 0, a: 0.6 }, offset: [0, 4], blur: 8 },
                }
              : rest,
          );
        }}
      />
      {text.shadow !== undefined && (
        <>
          <ColorField
            label="Shadow colour"
            value={text.shadow.color}
            onChange={(color, scrub) => {
              if (text.shadow !== undefined)
                commit(
                  { ...text, shadow: { ...text.shadow, color } },
                  scrub ? "text:shadowColor" : undefined,
                );
            }}
          />
          <ScrubNumber
            label="Shadow X"
            value={text.shadow.offset[0]}
            unit="px"
            step={1}
            min={-200}
            max={200}
            onCommit={(v, source) => {
              if (text.shadow !== undefined)
                commit(
                  { ...text, shadow: { ...text.shadow, offset: [v, text.shadow.offset[1]] } },
                  source === "type" ? undefined : "text:shadowX",
                );
            }}
          />
          <ScrubNumber
            label="Shadow Y"
            value={text.shadow.offset[1]}
            unit="px"
            step={1}
            min={-200}
            max={200}
            onCommit={(v, source) => {
              if (text.shadow !== undefined)
                commit(
                  { ...text, shadow: { ...text.shadow, offset: [text.shadow.offset[0], v] } },
                  source === "type" ? undefined : "text:shadowY",
                );
            }}
          />
          <ScrubNumber
            label="Shadow blur"
            value={text.shadow.blur}
            unit="px"
            step={1}
            min={0}
            max={200}
            onCommit={(v, source) => {
              if (text.shadow !== undefined)
                commit(
                  { ...text, shadow: { ...text.shadow, blur: v } },
                  source === "type" ? undefined : "text:shadowBlur",
                );
            }}
          />
        </>
      )}
      <Check
        label="Background box"
        checked={text.background !== undefined}
        onChange={(on) => {
          const { background: _removed, ...rest } = text;
          commit(
            on
              ? {
                  ...rest,
                  background: {
                    color: { r: 0, g: 0, b: 0, a: 0.6 },
                    padding: 12,
                    cornerRadius: 10,
                  },
                }
              : rest,
          );
        }}
      />
      {text.background !== undefined && (
        <>
          <ColorField
            label="Box colour"
            value={text.background.color}
            onChange={(color, scrub) => {
              if (text.background !== undefined)
                commit(
                  { ...text, background: { ...text.background, color } },
                  scrub ? "text:bgColor" : undefined,
                );
            }}
          />
          <ScrubNumber
            label="Box padding"
            value={text.background.padding}
            unit="px"
            step={1}
            min={0}
            max={200}
            onCommit={(v, source) => {
              if (text.background !== undefined)
                commit(
                  { ...text, background: { ...text.background, padding: v } },
                  source === "type" ? undefined : "text:bgPad",
                );
            }}
          />
          <ScrubNumber
            label="Corner radius"
            value={text.background.cornerRadius}
            unit="px"
            step={1}
            min={0}
            max={200}
            onCommit={(v, source) => {
              if (text.background !== undefined)
                commit(
                  { ...text, background: { ...text.background, cornerRadius: v } },
                  source === "type" ? undefined : "text:bgRadius",
                );
            }}
          />
        </>
      )}
    </Section>
  );
}
