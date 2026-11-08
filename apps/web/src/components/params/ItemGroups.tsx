import type { Op } from "@lumacut/schema";
import { keyframeToggleOps } from "../../inspector/animation.ts";
import type { ClipInfo, FieldDef } from "../../inspector/fields.ts";
import { fieldStateFor, opForField } from "../../inspector/selection.ts";
import type { ItemGroup } from "../../inspector/synthetic.ts";
import { keyStateOf, playheadOnClip } from "../../inspector/animation.ts";
import { FieldRow } from "../inspector/FieldRow.tsx";
import { KeyframeToggle } from "./KeyframeToggle.tsx";
import { ColorRow } from "./ColorRow.tsx";

interface ItemGroupsProps {
  groups: readonly ItemGroup[];
  item: ClipInfo;
  playheadUs: number;
  onChange: (op: Op, coalesceKey: string | undefined) => void;
}

/** Renders groups of item-level rows (masks, text animators): number/choice/flag fields, colours, buttons. */
export function ItemGroups({ groups, item, playheadUs, onChange }: ItemGroupsProps) {
  const items = [item];
  const toggle = (field: FieldDef) => {
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
    <>
      {groups.map((group) => (
        <div
          key={group.id}
          data-group={group.id}
          className="flex flex-col gap-2 rounded border border-neutral-800 p-2"
        >
          <h4 className="text-xs font-semibold text-neutral-200">{group.title}</h4>
          {group.rows.map((row, i) => {
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
                    state={keyStateOf(row.field, item.clip, playheadUs)}
                    enabled={playheadOnClip(item.clip, playheadUs)}
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
                  stored={row.read(item.clip)}
                  write={(color) => ({
                    type: "setProps",
                    clipId: item.clip.id,
                    props: row.write(item.clip, color),
                  })}
                  onChange={onChange}
                />
              );
            }
            return (
              <button
                key={`${row.label}:${String(i)}`}
                type="button"
                title={row.description}
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={() => {
                  const op = row.op(item.clip);
                  if (op !== null) onChange(op, undefined);
                }}
                className={`self-start rounded bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700 ${row.danger === true ? "text-red-300" : "text-neutral-200"}`}
              >
                {row.label}
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}
