import type { Op } from "@lumacut/schema";
import {
  animatedEditOp,
  keyStateOfItems,
  playheadOnClip,
  shownValue,
  type ItemKeyState,
} from "./animation.ts";
import {
  FIELDS,
  SECTIONS,
  type ClipInfo,
  type FieldDef,
  type FieldValue,
  type SectionId,
} from "./fields.ts";

/** One row of the inspector: a field and the value the selected clips share. */
export interface FieldState {
  def: FieldDef;
  /** The stored value when every selected clip has the same one; otherwise undefined. */
  value: FieldValue | undefined;
  mixed: boolean;
  /** How many selected clips this field applies to. */
  count: number;
  /** For an animatable property: whether it is animated at the playhead ("key" = on a keyframe). */
  keyState?: ItemKeyState;
  /** A keyframe can be added now (the playhead is on every selected clip it applies to). */
  canKey?: boolean;
}

export interface SectionState {
  id: SectionId;
  title: string;
  fields: FieldState[];
  /** The section has advanced fields (so it gets a Basic/Advanced switch). */
  hasAdvanced: boolean;
  /** Advanced fields currently hidden. */
  hiddenAdvanced: number;
}

export interface InspectorOptions {
  query: string;
  showAdvanced: Partial<Record<SectionId, boolean>>;
  /** Animated properties show their value at this time, and ◆ acts here. Default 0. */
  playheadUs?: number;
}

/** The row state for one field across the selection (values at the playhead, ◆ state). */
export function fieldStateFor(
  def: FieldDef,
  items: readonly ClipInfo[],
  playheadUs: number,
): FieldState {
  const applicable = items.filter((item) => def.appliesTo(item));
  const values = applicable.map((item) => shownValue(def, item.clip, playheadUs));
  const first = values[0];
  const mixed = values.some((v) => v !== first);
  const field: FieldState = {
    def,
    value: mixed ? undefined : first,
    mixed,
    count: applicable.length,
  };
  if (def.animation !== undefined) {
    field.keyState = keyStateOfItems(def, items, playheadUs);
    field.canKey = applicable.every((item) => playheadOnClip(item.clip, playheadUs));
  }
  return field;
}

function matches(def: FieldDef, sectionTitle: string, tokens: readonly string[]): boolean {
  const haystack = [def.label, sectionTitle, ...def.keywords].join(" ").toLowerCase();
  return tokens.every((t) => haystack.includes(t));
}

/**
 * What the inspector shows for the selected clips: only fields that apply, grouped in sections,
 * filtered by the search text, advanced fields hidden until asked for (a search shows them all).
 * Fields whose values differ between the clips are marked mixed.
 */
export function buildInspector(
  items: readonly ClipInfo[],
  options: InspectorOptions,
): SectionState[] {
  const playheadUs = options.playheadUs ?? 0;
  const tokens = options.query.toLowerCase().split(/\s+/).filter(Boolean);
  const searching = tokens.length > 0;
  const sections: SectionState[] = [];
  for (const section of SECTIONS) {
    const fields: FieldState[] = [];
    let hasAdvanced = false;
    let hiddenAdvanced = 0;
    for (const def of FIELDS.filter((f) => f.section === section.id)) {
      const applicable = items.filter((item) => def.appliesTo(item));
      if (applicable.length === 0) continue;
      if (def.advanced === true) hasAdvanced = true;
      if (searching && !matches(def, section.title, tokens)) continue;
      if (!searching && def.advanced === true && options.showAdvanced[section.id] !== true) {
        hiddenAdvanced += 1;
        continue;
      }
      fields.push(fieldStateFor(def, items, playheadUs));
    }
    if (fields.length > 0)
      sections.push({ id: section.id, title: section.title, fields, hasAdvanced, hiddenAdvanced });
  }
  return sections;
}

/** The ops that set a field to `stored` on every selected clip it applies to (clips already at that value are skipped). */
export function opsForField(
  def: FieldDef,
  stored: FieldValue,
  items: readonly ClipInfo[],
  playheadUs = 0,
): Op[] {
  const ops: Op[] = [];
  for (const item of items) {
    if (!def.appliesTo(item) || def.readOnly === true) continue;
    if (shownValue(def, item.clip, playheadUs) === stored) continue;
    // An animated property changes through a keyframe at the playhead, not its static value.
    const keyed = animatedEditOp(def, stored, item.clip, playheadUs);
    if (keyed !== null) {
      ops.push(keyed);
      continue;
    }
    const patch = def.set(item.clip, stored);
    ops.push({
      type: "setProps",
      clipId: item.clip.id,
      props: patch.props,
      ...(patch.unset === undefined || patch.unset.length === 0 ? {} : { unset: patch.unset }),
    });
  }
  return ops;
}

/** One undo step for a field change across the selection. */
export function opForField(
  def: FieldDef,
  stored: FieldValue,
  items: readonly ClipInfo[],
  playheadUs = 0,
): Op | null {
  const ops = opsForField(def, stored, items, playheadUs);
  if (ops.length === 0) return null;
  return ops.length === 1 && ops[0] !== undefined
    ? ops[0]
    : { type: "batch", label: `Change ${def.label.toLowerCase()}`, ops };
}
