import type { Composition, Op, Project } from "@lumacut/schema";
import { useState } from "react";
import type { ClipInfo } from "../../inspector/fields.ts";
import {
  addMaskOp,
  ellipsePath,
  layerSizeOf,
  maskGroups,
  newPathMask,
  rectPath,
} from "../../inspector/masks.ts";
import { newId } from "../../lib/ids.ts";
import { Section } from "../inspector/Section.tsx";
import { ItemGroups } from "../params/ItemGroups.tsx";

interface MasksInspectorProps {
  item: ClipInfo;
  project: Project | undefined;
  composition: Composition;
  playheadUs: number;
  onChange: (op: Op, coalesceKey: string | undefined) => void;
}

/** A clip's masks: add one, then mode, feather, expansion, opacity and invert for each. Draw them with the pen on the canvas. */
export function MasksInspector({
  item,
  project,
  composition,
  playheadUs,
  onChange,
}: MasksInspectorProps) {
  const [open, setOpen] = useState(true);
  const clip = item.clip;
  const size =
    project === undefined
      ? { width: composition.width, height: composition.height }
      : layerSizeOf(clip, project, composition);
  const add = (kind: "rect" | "ellipse") => {
    const w = size.width * 0.5;
    const h = size.height * 0.5;
    const path =
      kind === "rect"
        ? rectPath(size.width / 2, size.height / 2, w, h)
        : ellipsePath(size.width / 2, size.height / 2, w, h);
    onChange(addMaskOp(clip, newPathMask(newId(), path)), undefined);
  };
  return (
    <Section
      id="masks"
      title="Masks"
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
      <div className="flex flex-wrap gap-1" role="group" aria-label="Add a mask">
        <button
          type="button"
          title="Add a rectangular mask in the middle of the clip. Use the pen tool (P) to draw any shape."
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          onClick={() => {
            add("rect");
          }}
          className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-700"
        >
          + Rectangle mask
        </button>
        <button
          type="button"
          title="Add an elliptical mask in the middle of the clip."
          onMouseDown={(e) => {
            e.preventDefault();
          }}
          onClick={() => {
            add("ellipse");
          }}
          className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-700"
        >
          + Ellipse mask
        </button>
      </div>
      {clip.masks.length === 0 && (
        <p className="text-xs text-neutral-500">
          No masks. A mask hides everything of the clip outside its shape.
        </p>
      )}
      <ItemGroups
        groups={maskGroups(clip)}
        item={item}
        playheadUs={playheadUs}
        onChange={onChange}
      />
    </Section>
  );
}
