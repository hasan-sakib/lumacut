import type { Op } from "@lumacut/schema";
import { useState } from "react";
import type { ClipInfo } from "../../inspector/fields.ts";
import { fieldStateFor, opForField } from "../../inspector/selection.ts";
import { keyframeToggleOps } from "../../inspector/animation.ts";
import { SHAPE_KINDS, addItemOp, removeItemOp, shapeGroups } from "../../inspector/shapes.ts";
import { newId } from "../../lib/ids.ts";
import { keyStateOf, playheadOnClip } from "../../inspector/animation.ts";
import { FieldRow } from "../inspector/FieldRow.tsx";
import { KeyframeToggle } from "../params/KeyframeToggle.tsx";
import { Section } from "../inspector/Section.tsx";
import { ColorRow } from "../params/ColorRow.tsx";

interface ShapeInspectorProps {
  item: ClipInfo;
  playheadUs: number;
  onChange: (op: Op, coalesceKey: string | undefined) => void;
}

/** A shape clip's items (rectangles, ellipses, polygons, stars, pen paths) and how they are painted. */
export function ShapeInspector({ item, playheadUs, onChange }: ShapeInspectorProps) {
  const [open, setOpen] = useState(true);
  const clip = item.clip;
  if (clip.shape === undefined) return null;
  const items = [item];
  const groups = shapeGroups(clip);
  const toggle = (field: Parameters<typeof keyframeToggleOps>[0]) => {
    const ops = keyframeToggleOps(field, items, playheadUs);
    const only = ops[0];
    if (only !== undefined) {
      onChange(
        ops.length === 1 ? only : { type: "batch", label: "Toggle keyframe", ops },
        undefined,
      );
    }
  };
  return (
    <Section
      id="shape"
      title="Shape"
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
      <div className="flex flex-wrap gap-1" role="group" aria-label="Add to this shape">
        {SHAPE_KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            title={`Add a ${k.label.toLowerCase()} to this shape: ${k.description}`}
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={() => {
              const op = addItemOp(clip, k.kind, newId());
              if (op !== null) onChange(op, undefined);
            }}
            className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-700"
          >
            + {k.label}
          </button>
        ))}
      </div>
      {groups.map((group) => (
        <div
          key={group.id}
          data-shape-group={group.id}
          className="flex flex-col gap-2 rounded border border-neutral-800 p-2"
        >
          <h4 className="text-xs font-semibold text-neutral-200">{group.title}</h4>
          {group.rows.map((row) => {
            if (row.type === "field") {
              return (
                <FieldRow
                  key={row.field.id}
                  field={fieldStateFor(row.field, items, playheadUs)}
                  onChange={(stored, source) => {
                    const op = opForField(row.field, stored, items, playheadUs);
                    if (op !== null) {
                      onChange(
                        op,
                        source === "scrub" || source === "step"
                          ? `inspector:${row.field.id}`
                          : undefined,
                      );
                    }
                  }}
                  onToggleKey={() => {
                    toggle(row.field);
                  }}
                />
              );
            }
            if (row.type === "key") {
              return (
                <div
                  key={row.field.id}
                  className="grid grid-cols-[1.25rem_1fr] items-center gap-2 text-xs text-neutral-300"
                >
                  <KeyframeToggle
                    label={row.label}
                    state={keyStateOf(row.field, clip, playheadUs)}
                    enabled={playheadOnClip(clip, playheadUs)}
                    onToggle={() => {
                      toggle(row.field);
                    }}
                  />
                  <span>{row.label}</span>
                </div>
              );
            }
            if (row.type === "color") {
              return (
                <ColorRow
                  key={row.field.id}
                  label={row.label}
                  field={row.field}
                  item={item}
                  playheadUs={playheadUs}
                  stored={row.read(clip)}
                  write={(color) => ({
                    type: "setProps",
                    clipId: clip.id,
                    props: row.write(clip, color),
                  })}
                  onChange={onChange}
                />
              );
            }
            return (
              <button
                key={row.itemId}
                type="button"
                title={`Remove ${row.label} from the shape`}
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={() => {
                  const op = removeItemOp(clip, row.itemId);
                  if (op !== null) onChange(op, undefined);
                }}
                className="self-start rounded bg-neutral-800 px-2 py-1 text-xs text-red-300 hover:bg-neutral-700"
              >
                Remove {row.label}
              </button>
            );
          })}
        </div>
      ))}
    </Section>
  );
}
