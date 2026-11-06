import { ActionError, ActionRegistry } from "@lumacut/actions";
import { endOf } from "@lumacut/ops";
import {
  centeredTransform,
  createClip,
  createTrack,
  type Asset,
  type Clip,
  type Composition,
  type Marker,
  type Op,
  type Project,
  type Track,
  type TrackKind,
  type TrackPatch,
} from "@lumacut/schema";
import * as z from "zod";

/** Things an editing action can't do itself (ids, the history, the library). Supplied by the page. */
export interface EditingServices {
  /** A fresh id for a clip, track, marker or link group. */
  newId: () => string;
  undo: () => void;
  redo: () => void;
  /** A library asset as the project's `Asset`, or null when it isn't ready to use. */
  assetForProject: (assetId: string) => Asset | null;
  /** Opens the command palette / the keyboard shortcut list. */
  openPalette: () => void;
  showShortcuts: () => void;
}

/** What an editing action can see: the document, the selection, the playhead, the history. */
export interface EditingContext {
  project: Project | null;
  compositionId: string | null;
  selectedClipIds: readonly string[];
  selectedTrackId: string | null;
  playheadUs: number;
  canUndo: boolean;
  canRedo: boolean;
  services: EditingServices;
}

export const editingActions = new ActionRegistry<EditingContext>();

/** How long a still image stays on the timeline when dropped in. */
export const DEFAULT_IMAGE_US = 5_000_000;

// --- Reading the context ----------------------------------------------------------------------

function activeComposition(ctx: EditingContext): Composition | undefined {
  return ctx.project?.compositions.find((c) => c.id === ctx.compositionId);
}

interface Placed {
  clip: Clip;
  track: Track;
}

function placedClips(comp: Composition): Placed[] {
  return comp.tracks.flatMap((track) => track.clips.map((clip) => ({ clip, track })));
}

/** The ids plus every clip linked to one of them (a linked pair is edited as one). */
function withLinked(comp: Composition, ids: readonly string[]): string[] {
  const all = placedClips(comp);
  const links = new Set(all.filter((p) => ids.includes(p.clip.id) && p.clip.linkId).map((p) => p.clip.linkId));
  const out = new Set(ids.filter((id) => all.some((p) => p.clip.id === id)));
  for (const p of all) if (p.clip.linkId !== undefined && links.has(p.clip.linkId)) out.add(p.clip.id);
  return [...out];
}

function selectedWithLinked(ctx: EditingContext): string[] {
  const comp = activeComposition(ctx);
  return comp === undefined ? [] : withLinked(comp, ctx.selectedClipIds);
}

/** Clips the playhead cuts through: the selection if there is one, otherwise every unlocked track. */
function splitTargets(ctx: EditingContext): Placed[] {
  const comp = activeComposition(ctx);
  if (comp === undefined) return [];
  const t = ctx.playheadUs;
  const inside = ({ clip, track }: Placed) => !track.locked && clip.startUs < t && t < endOf(clip);
  const all = placedClips(comp);
  if (ctx.selectedClipIds.length === 0) return all.filter(inside);
  const ids = new Set(withLinked(comp, ctx.selectedClipIds));
  return all.filter((p) => ids.has(p.clip.id) && inside(p));
}

const hasSelection = (ctx: EditingContext): boolean => selectedWithLinked(ctx).length > 0;

function selectedTrack(ctx: EditingContext): Track | undefined {
  return activeComposition(ctx)?.tracks.find((t) => t.id === ctx.selectedTrackId);
}

// --- The palette itself ------------------------------------------------------------------------

editingActions.register({
  id: "palette.open",
  title: "Command palette",
  description: "Search every command by name or by what you want to do, and run it.",
  keywords: ["search", "find", "commands", "actions", "everything"],
  category: "Help",
  icon: "command",
  shortcut: "Mod+K",
  when: () => true,
  run: (ctx) => {
    ctx.services.openPalette();
    return undefined;
  },
});

editingActions.register({
  id: "help.shortcuts",
  title: "Keyboard shortcuts",
  description: "Show every keyboard shortcut.",
  keywords: ["keys", "hotkeys", "cheat sheet", "help"],
  category: "Help",
  icon: "command",
  shortcut: "?",
  when: () => true,
  run: (ctx) => {
    ctx.services.showShortcuts();
    return undefined;
  },
});

// --- History ----------------------------------------------------------------------------------

editingActions.register({
  id: "history.undo",
  title: "Undo",
  description: "Undo the last change to the project.",
  keywords: ["revert", "back", "take back"],
  category: "Edit",
  icon: "undo",
  shortcut: "Mod+Z",
  when: (ctx) => ctx.canUndo,
  run: (ctx) => {
    ctx.services.undo();
    return undefined;
  },
});

editingActions.register({
  id: "history.redo",
  title: "Redo",
  description: "Redo the change you just undid.",
  keywords: ["again", "forward", "repeat"],
  category: "Edit",
  icon: "redo",
  shortcut: "Mod+Shift+Z",
  when: (ctx) => ctx.canRedo,
  run: (ctx) => {
    ctx.services.redo();
    return undefined;
  },
});

// --- Clips ------------------------------------------------------------------------------------

editingActions.register({
  id: "clip.split",
  title: "Split clip at playhead",
  description: "Cut the selected clips (or every clip under the playhead) into two at the playhead.",
  keywords: ["cut", "razor", "divide", "blade", "slice"],
  category: "Edit",
  icon: "split",
  shortcut: "S",
  when: (ctx) => splitTargets(ctx).length > 0,
  run: (ctx) => {
    const ops: Op[] = [];
    const secondHalves = new Map<string, string[]>();
    for (const { clip } of splitTargets(ctx)) {
      const newClipId = ctx.services.newId();
      ops.push({ type: "splitClip", clipId: clip.id, atUs: ctx.playheadUs, newClipId });
      if (clip.linkId !== undefined) {
        secondHalves.set(clip.linkId, [...(secondHalves.get(clip.linkId) ?? []), newClipId]);
      }
    }
    // The new halves of a linked pair stay linked to each other.
    for (const members of secondHalves.values()) {
      if (members.length >= 2) ops.push({ type: "linkClips", clipIds: members, linkId: ctx.services.newId() });
    }
    return ops;
  },
});

editingActions.register({
  id: "clip.delete",
  title: "Delete clip",
  description: "Remove the selected clips (and clips linked to them), leaving a gap.",
  keywords: ["remove", "erase", "trash", "clear"],
  category: "Edit",
  icon: "trash",
  shortcut: "Delete",
  when: hasSelection,
  run: (ctx) => selectedWithLinked(ctx).map((clipId): Op => ({ type: "removeClip", clipId })),
});

editingActions.register({
  id: "clip.rippleDelete",
  title: "Ripple delete",
  description: "Remove the selected clips and close the gap by moving later clips left.",
  keywords: ["remove", "close gap", "lift", "delete and shift"],
  category: "Edit",
  icon: "trash",
  shortcut: "Shift+Delete",
  when: hasSelection,
  run: (ctx): Op => ({
    type: "rippleDelete",
    compositionId: ctx.compositionId ?? "",
    target: { kind: "clips", clipIds: selectedWithLinked(ctx) },
  }),
});

editingActions.register({
  id: "clip.duplicate",
  title: "Duplicate clip",
  description: "Copy the selected clips and place the copies right after the selection.",
  keywords: ["copy", "clone", "repeat"],
  category: "Edit",
  icon: "copy",
  shortcut: "Mod+D",
  when: hasSelection,
  run: (ctx) => {
    const comp = activeComposition(ctx);
    if (comp === undefined) return [];
    const ids = new Set(selectedWithLinked(ctx));
    const chosen = placedClips(comp).filter((p) => ids.has(p.clip.id));
    const first = Math.min(...chosen.map((p) => p.clip.startUs));
    const last = Math.max(...chosen.map((p) => endOf(p.clip)));
    return chosen.map(({ clip, track }): Op => {
      const { linkId: _unlinked, transitionIn: _noTransition, ...rest } = clip;
      return {
        type: "addClip",
        trackId: track.id,
        clip: { ...structuredClone(rest), id: ctx.services.newId(), startUs: clip.startUs + (last - first) },
      };
    });
  },
});

editingActions.register({
  id: "clip.link",
  title: "Link clips",
  description: "Link the selected clips so they are selected, moved and cut together.",
  keywords: ["group", "attach", "sync audio video"],
  category: "Edit",
  icon: "link",
  shortcut: "Mod+L",
  when: (ctx) => ctx.selectedClipIds.length >= 2,
  run: (ctx): Op => ({ type: "linkClips", clipIds: [...ctx.selectedClipIds], linkId: ctx.services.newId() }),
});

editingActions.register({
  id: "clip.unlink",
  title: "Unlink clips",
  description: "Separate the selected clips from their link group, e.g. to edit video and audio apart.",
  keywords: ["ungroup", "detach", "separate audio"],
  category: "Edit",
  icon: "unlink",
  shortcut: "Mod+Shift+L",
  when: (ctx) => {
    const comp = activeComposition(ctx);
    if (comp === undefined) return false;
    return placedClips(comp).some((p) => p.clip.linkId !== undefined && selectedWithLinked(ctx).includes(p.clip.id));
  },
  run: (ctx): Op => ({ type: "unlinkClips", clipIds: selectedWithLinked(ctx) }),
});

// --- Tracks -----------------------------------------------------------------------------------

function addTrackOp(ctx: EditingContext, kind: TrackKind): Op {
  const comp = activeComposition(ctx);
  if (comp === undefined) throw new ActionError("Open a composition first.");
  const count = comp.tracks.filter((t) => t.kind === kind).length + 1;
  const name = `${kind === "visual" ? "Video" : "Audio"} ${String(count)}`;
  // New tracks go on top: the last track composites over the others.
  return {
    type: "addTrack",
    compositionId: comp.id,
    track: createTrack({ id: ctx.services.newId(), kind, name }),
    index: comp.tracks.length,
  };
}

editingActions.register({
  id: "track.addVideo",
  title: "Add video track",
  description: "Add an empty picture track above the others.",
  keywords: ["layer", "new track", "overlay", "picture"],
  category: "Track",
  icon: "video",
  when: (ctx) => activeComposition(ctx) !== undefined,
  run: (ctx) => addTrackOp(ctx, "visual"),
});

editingActions.register({
  id: "track.addAudio",
  title: "Add audio track",
  description: "Add an empty audio track.",
  keywords: ["sound", "music", "new track", "voice"],
  category: "Track",
  icon: "audio",
  when: (ctx) => activeComposition(ctx) !== undefined,
  run: (ctx) => addTrackOp(ctx, "audio"),
});

editingActions.register({
  id: "track.remove",
  title: "Delete track",
  description: "Remove the selected track and all clips on it.",
  keywords: ["remove track", "erase track"],
  category: "Track",
  icon: "trash",
  when: (ctx) => selectedTrack(ctx) !== undefined,
  run: (ctx): Op => ({ type: "removeTrack", compositionId: ctx.compositionId ?? "", trackId: ctx.selectedTrackId ?? "" }),
});

function registerToggle(
  id: string,
  title: string,
  description: string,
  keywords: string[],
  prop: "muted" | "solo" | "locked" | "hidden",
): void {
  editingActions.register({
    id,
    title,
    description,
    keywords,
    category: "Track",
    when: (ctx) => selectedTrack(ctx) !== undefined,
    run: (ctx): Op => {
      const track = selectedTrack(ctx);
      return { type: "setTrackProps", trackId: ctx.selectedTrackId ?? "", props: { [prop]: !track?.[prop] } as TrackPatch };
    },
  });
}

registerToggle("track.toggleMute", "Mute / unmute track", "Silence the selected track, or turn its sound back on.", ["silence", "volume off"], "muted");
registerToggle("track.toggleSolo", "Solo / unsolo track", "Hear only the selected track, or hear everything again.", ["isolate", "only this"], "solo");
registerToggle("track.toggleLock", "Lock / unlock track", "Protect the selected track from edits, or allow edits again.", ["protect", "freeze", "unlock"], "locked");
registerToggle("track.toggleHide", "Show / hide track", "Hide the selected track from the picture, or show it again.", ["visibility", "eye", "invisible"], "hidden");

// --- Markers ----------------------------------------------------------------------------------

const MARKER_COLOR: Marker["color"] = { r: 1, g: 0.6, b: 0, a: 1 };

editingActions.register({
  id: "marker.add",
  title: "Add marker at playhead",
  description: "Drop a marker (with an optional label) at the playhead.",
  keywords: ["flag", "bookmark", "note", "cue"],
  category: "Timeline",
  icon: "marker",
  shortcut: "M",
  argsSchema: z.object({ label: z.string().optional() }).optional() as unknown as z.ZodType<{ label?: string } | undefined>,
  when: (ctx) => activeComposition(ctx) !== undefined,
  run: (ctx, args): Op => ({
    type: "addMarker",
    compositionId: ctx.compositionId ?? "",
    marker: { id: ctx.services.newId(), tUs: ctx.playheadUs, durationUs: 0, label: args?.label ?? "", color: MARKER_COLOR },
  }),
});

editingActions.register({
  id: "marker.remove",
  title: "Remove marker at playhead",
  description: "Delete the marker sitting exactly at the playhead.",
  keywords: ["delete marker", "unflag", "clear marker"],
  category: "Timeline",
  when: (ctx) => activeComposition(ctx)?.markers.some((m) => m.tUs === ctx.playheadUs) === true,
  run: (ctx): Op[] =>
    (activeComposition(ctx)?.markers ?? [])
      .filter((m) => m.tUs === ctx.playheadUs)
      .map((m): Op => ({ type: "removeMarker", compositionId: ctx.compositionId ?? "", markerId: m.id })),
});

// --- Adding media -----------------------------------------------------------------------------

function mediaLength(asset: Asset, kind: "video" | "audio"): number {
  if (asset.kind === "image") return DEFAULT_IMAGE_US;
  return (kind === "audio" ? asset.audio?.durationUs : asset.video?.durationUs) ?? asset.audio?.durationUs ?? DEFAULT_IMAGE_US;
}

/** The first unlocked track of this kind with nothing in [start, end), or a new track op for it. */
function trackFor(ctx: EditingContext, comp: Composition, kind: TrackKind, start: number, end: number, ops: Op[]): string {
  const free = comp.tracks.find(
    (t) => t.kind === kind && !t.locked && t.clips.every((c) => endOf(c) <= start || c.startUs >= end),
  );
  if (free !== undefined) return free.id;
  const op = addTrackOp(ctx, kind);
  ops.push(op);
  return op.type === "addTrack" ? op.track.id : "";
}

editingActions.register({
  id: "timeline.addAssetAtPlayhead",
  title: "Add media at playhead",
  description: "Place a library asset on the timeline at the playhead (a video's sound goes on an audio track, linked).",
  keywords: ["insert", "import", "put on timeline", "drop", "place clip"],
  category: "Timeline",
  icon: "upload",
  argsSchema: z.object({ assetId: z.string().describe("Id of a ready asset in the library") }) as unknown as z.ZodType<{ assetId: string }>,
  when: (ctx) => activeComposition(ctx) !== undefined,
  run: (ctx, args): Op[] => {
    const comp = activeComposition(ctx);
    const project = ctx.project;
    if (comp === undefined || project === null) throw new ActionError("Open a composition first.");
    const asset = ctx.services.assetForProject(args.assetId);
    if (asset === null) throw new ActionError("This asset isn't ready to use yet.");
    const ops: Op[] = [];
    if (!project.assets.some((a) => a.id === asset.id)) ops.push({ type: "addAsset", asset });
    const start = ctx.playheadUs;
    const added: string[] = [];

    if (asset.kind !== "audio") {
      const length = mediaLength(asset, "video");
      const size = asset.video ?? asset.image ?? { width: comp.width, height: comp.height };
      const trackId = trackFor(ctx, comp, "visual", start, start + length, ops);
      const id = ctx.services.newId();
      added.push(id);
      ops.push({
        type: "addClip",
        trackId,
        clip: createClip({ id, type: "media", assetId: asset.id, startUs: start, inUs: 0, outUs: length, transform: centeredTransform(comp, size) }),
      });
    }
    if (asset.kind === "audio" || (asset.kind === "video" && asset.audio !== undefined)) {
      const length = mediaLength(asset, "audio");
      const trackId = trackFor(ctx, comp, "audio", start, start + length, ops);
      const id = ctx.services.newId();
      added.push(id);
      ops.push({ type: "addClip", trackId, clip: createClip({ id, type: "media", assetId: asset.id, startUs: start, inUs: 0, outUs: length }) });
    }
    if (added.length === 2) ops.push({ type: "linkClips", clipIds: added, linkId: ctx.services.newId() });
    return ops;
  },
});
