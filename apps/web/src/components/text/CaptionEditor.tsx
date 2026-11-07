import type { CaptionWord, Clip, Color, Op } from "@lumacut/schema";
import { useState } from "react";
import { CAPTION_STYLES, applyCaptionStyle, captionStyleById } from "../../captions/styles.ts";
import {
  mergeWithNext,
  removeWord,
  retimeWord,
  setWordText,
  shiftWords,
  splitWord,
} from "../../captions/words.ts";
import { colorToHex, hexToColor } from "../../inspector/effects.ts";
import { endOf } from "@lumacut/ops";
import { ScrubNumber } from "../inspector/ScrubNumber.tsx";
import { Section } from "../inspector/Section.tsx";

interface CaptionEditorProps {
  clip: Clip;
  compositionHeight: number;
  onChange: (op: Op, coalesceKey: string | undefined) => void;
}

const US = 1_000_000;

/** Edit a caption's words and timing, how they are grouped on screen, and its style. */
export function CaptionEditor({ clip, compositionHeight, onChange }: CaptionEditorProps) {
  const [open, setOpen] = useState(true);
  const caption = clip.caption;
  if (caption === undefined) return null;
  const limitUs = endOf(clip) - clip.startUs;
  const commitWords = (words: CaptionWord[], key?: string) => {
    onChange({ type: "setProps", clipId: clip.id, props: { caption: { ...caption, words } } }, key);
  };
  const commitCaption = (patch: Partial<typeof caption>, key?: string) => {
    onChange(
      { type: "setProps", clipId: clip.id, props: { caption: { ...caption, ...patch } } },
      key,
    );
  };
  return (
    <Section
      id="captions"
      title="Captions"
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
      <label className="grid grid-cols-[1.25rem_6rem_1fr] items-center gap-2 text-xs text-neutral-300">
        <span />
        <span>Style</span>
        <select
          aria-label="Caption style"
          value={caption.styleId ?? ""}
          onChange={(e) => {
            const style = captionStyleById(e.target.value);
            if (style === undefined) return;
            const styled = applyCaptionStyle(style, { height: compositionHeight }, caption);
            onChange({ type: "setProps", clipId: clip.id, props: styled }, undefined);
          }}
          className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-1 text-xs text-neutral-100"
        >
          {caption.styleId === undefined && <option value="">Custom</option>}
          {CAPTION_STYLES.map((s) => (
            <option key={s.id} value={s.id} title={s.description}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-[1.25rem_6rem_1fr] items-center gap-2 text-xs text-neutral-300">
        <span />
        <span>Spoken word</span>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            aria-label="Highlight the spoken word"
            checked={caption.highlightColor !== undefined}
            onChange={(e) => {
              const { highlightColor: _removed, ...rest } = caption;
              onChange(
                {
                  type: "setProps",
                  clipId: clip.id,
                  props: {
                    caption: e.target.checked
                      ? { ...rest, highlightColor: { r: 1, g: 0.84, b: 0.04, a: 1 } }
                      : rest,
                  },
                },
                undefined,
              );
            }}
            className="h-4 w-4 accent-sky-500"
          />
          {caption.highlightColor !== undefined && (
            <input
              type="color"
              aria-label="Highlight colour"
              value={colorToHex(caption.highlightColor)}
              onChange={(e) => {
                const highlightColor: Color = hexToColor(e.target.value, 1);
                commitCaption({ highlightColor }, "caption:highlight");
              }}
              className="h-6 w-12 cursor-pointer rounded border border-neutral-700 bg-neutral-950"
            />
          )}
        </div>
      </div>
      <ScrubNumber
        label="Lines"
        value={caption.maxLines ?? 2}
        step={1}
        min={1}
        max={6}
        onCommit={(v, source) => {
          commitCaption(
            { maxLines: Math.round(v) },
            source === "type" ? undefined : "caption:lines",
          );
        }}
      />
      <ScrubNumber
        label="Characters per line"
        value={caption.maxCharsPerLine ?? 32}
        step={1}
        min={4}
        max={120}
        onCommit={(v, source) => {
          commitCaption(
            { maxCharsPerLine: Math.round(v) },
            source === "type" ? undefined : "caption:chars",
          );
        }}
      />
      <ScrubNumber
        label="Shift all"
        value={0}
        unit="s"
        step={0.05}
        onCommit={(v, source) => {
          if (v !== 0)
            commitWords(
              shiftWords(caption.words, Math.round(v * US), limitUs),
              source === "type" ? undefined : "caption:shift",
            );
        }}
      />
      <ol aria-label="Caption words" className="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
        {caption.words.map((word, i) => (
          <li
            key={`${String(i)}:${String(word.startUs)}`}
            data-word={i}
            className="flex items-center gap-1 rounded border border-neutral-800 p-1 text-xs"
          >
            <input
              aria-label={`Word ${String(i + 1)}`}
              defaultValue={word.text}
              onBlur={(e) => {
                if (e.target.value !== word.text)
                  commitWords(setWordText(caption.words, i, e.target.value));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className="w-24 rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5 text-neutral-100"
            />
            <input
              aria-label={`Word ${String(i + 1)} start (seconds)`}
              title="Start (seconds)"
              type="number"
              step={0.05}
              min={0}
              value={Number((word.startUs / US).toFixed(3))}
              onChange={(e) => {
                commitWords(
                  retimeWord(
                    caption.words,
                    i,
                    { startUs: Math.round(Number(e.target.value) * US) },
                    limitUs,
                  ),
                  `caption:start:${String(i)}`,
                );
              }}
              className="w-16 rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5 font-mono text-neutral-100"
            />
            <input
              aria-label={`Word ${String(i + 1)} end (seconds)`}
              title="End (seconds)"
              type="number"
              step={0.05}
              min={0}
              value={Number((word.endUs / US).toFixed(3))}
              onChange={(e) => {
                commitWords(
                  retimeWord(
                    caption.words,
                    i,
                    { endUs: Math.round(Number(e.target.value) * US) },
                    limitUs,
                  ),
                  `caption:end:${String(i)}`,
                );
              }}
              className="w-16 rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5 font-mono text-neutral-100"
            />
            <button
              type="button"
              title="Split this word in half"
              aria-label={`Split word ${String(i + 1)}`}
              disabled={word.text.length < 2}
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={() => {
                commitWords(splitWord(caption.words, i, Math.floor(word.text.length / 2)));
              }}
              className="rounded px-1 text-neutral-300 hover:bg-neutral-800 disabled:opacity-30"
            >
              ✂
            </button>
            <button
              type="button"
              title="Join with the next word"
              aria-label={`Merge word ${String(i + 1)} with the next`}
              disabled={i === caption.words.length - 1}
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={() => {
                commitWords(mergeWithNext(caption.words, i));
              }}
              className="rounded px-1 text-neutral-300 hover:bg-neutral-800 disabled:opacity-30"
            >
              ⇥
            </button>
            <button
              type="button"
              title="Delete this word"
              aria-label={`Delete word ${String(i + 1)}`}
              onMouseDown={(e) => {
                e.preventDefault();
              }}
              onClick={() => {
                commitWords(removeWord(caption.words, i));
              }}
              className="rounded px-1 text-red-300 hover:bg-neutral-800"
            >
              ✕
            </button>
          </li>
        ))}
      </ol>
    </Section>
  );
}
