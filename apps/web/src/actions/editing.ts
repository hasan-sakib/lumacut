import { ActionError, ActionRegistry } from "@lumacut/actions";
import { endOf } from "@lumacut/ops";
import {
  centeredTransform,
  createClip,
  createTrack,
  type Asset,
  type Composition,
  type Marker,
  type Op,
  type Project,
  type Track,
  type TrackKind,
} from "@lumacut/schema";
import * as z from "zod";
import { lastFrameUs, skipTarget, stepTarget } from "../engine/transport.ts";
import type { Tool } from "../stores/editor.ts";
import { placedClips, splitOps, withLinked, type Placed } from "../timeline/clips.ts";
import {
  copyAttributes,
  copyClips,
  pasteAttributesOps,
  pasteOps,
  type Attributes,
  type ClipboardData,
} from "../timeline/clipboard.ts";
import { roundToFrame } from "../timeline/geometry.ts";

/** Things an editing action can't do itself (ids, the history, the library). Supplied by the page. */
export interface EditingServices {
  /** A fresh id for a clip, track, marker or link group. */
  newId: () => string;
  undo: () => void;
  redo: () => void;
  /** A library asset as the project's `Asset`, or null when it isn't ready to use. */
  /** Finds a ready library asset by id or (part of) its name; an error message when none or several match. */
  resolveAsset: (query: string) => { asset: Asset } | { error: string };
  /** The editor's internal clipboard (clips, and a clip's look). */
  clipboard: {
    setClips: (data: ClipboardData | null) => void;
    setAttributes: (attributes: Attributes | null) => void;
  };
  /** Opens the command palette / the keyboard shortcut list. */
  openPalette: () => void;
  showShortcuts: () => void;
  /** The preview: start/stop playing, and jump to a time (moves the picture and the sound). */
  playback: { togglePlay: () => void; seek: (us: number) => void };
  /** Editor view state that isn't part of the document. */
  editor: {
    setTool: (tool: Tool) => void;
    zoomBy: (factor: number) => void;
    zoomFit: () => void;
    toggleSnapping: () => void;
    selectClips: (ids: string[]) => void;
  };
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
  /** Clips are on the clipboard / a clip's look is. */
  hasClipboard: boolean;
  hasAttributes: boolean;
  /** The clipboard's contents, for pasting. */
  clipboard: ClipboardData | null;
  attributes: Attributes | null;
  services: EditingServices;
}

export const editingActions = new ActionRegistry<EditingContext>();

/** How long a still image stays on the timeline when dropped in. */
export const DEFAULT_IMAGE_US = 5_000_000;

// --- Reading the context ----------------------------------------------------------------------

function activeComposition(ctx: EditingContext): Composition | undefined {
  return ctx.project?.compositions.find((c) => c.id === ctx.compositionId);
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

/** Duration of the active composition, or 0 (playback and stepping need something to play). */
const duration = (ctx: EditingContext): number => activeComposition(ctx)?.durationUs ?? 0;
const fpsOf = (ctx: EditingContext) => activeComposition(ctx)?.fps ?? { num: 30, den: 1 };

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
  description:
    "Cut the selected clips (or every clip under the playhead) into two at the playhead.",
  keywords: ["cut", "razor", "divide", "blade", "slice"],
  category: "Edit",
  icon: "split",
  shortcut: "S",
  when: (ctx) => splitTargets(ctx).length > 0,
  run: (ctx) =>
    splitOps(
      splitTargets(ctx).map((p) => p.clip),
      ctx.playheadUs,
      ctx.services.newId,
    ),
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
        clip: {
          ...structuredClone(rest),
          id: ctx.services.newId(),
          startUs: clip.startUs + (last - first),
        },
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
  run: (ctx): Op => ({
    type: "linkClips",
    clipIds: [...ctx.selectedClipIds],
    linkId: ctx.services.newId(),
  }),
});

editingActions.register({
  id: "clip.unlink",
  title: "Unlink clips",
  description:
    "Separate the selected clips from their link group, e.g. to edit video and audio apart.",
  keywords: ["ungroup", "detach", "separate audio"],
  category: "Edit",
  icon: "unlink",
  shortcut: "Mod+Shift+L",
  when: (ctx) => {
    const comp = activeComposition(ctx);
    if (comp === undefined) return false;
    return placedClips(comp).some(
      (p) => p.clip.linkId !== undefined && selectedWithLinked(ctx).includes(p.clip.id),
    );
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
  run: (ctx): Op => ({
    type: "removeTrack",
    compositionId: ctx.compositionId ?? "",
    trackId: ctx.selectedTrackId ?? "",
  }),
});

function registerToggle(
  id: string,
  title: string,
  description: string,
  keywords: string[],
  prop: "muted" | "solo" | "locked" | "hidden",
  icon: string,
): void {
  editingActions.register({
    id,
    title,
    description,
    keywords,
    category: "Track",
    icon,
    // Track headers pass the track in `trackId`; elsewhere it acts on the selected track.
    argsSchema: z.object({ trackId: z.string().optional() }).optional(),
    when: (ctx) => (activeComposition(ctx)?.tracks.length ?? 0) > 0,
    run: (ctx, args): Op => {
      const trackId = args?.trackId ?? ctx.selectedTrackId;
      const track = activeComposition(ctx)?.tracks.find((t) => t.id === trackId);
      if (track === undefined) throw new ActionError("Select a track first.");
      return {
        type: "setTrackProps",
        trackId: track.id,
        props: { [prop]: !track[prop] },
      };
    },
  });
}

registerToggle(
  "track.toggleMute",
  "Mute / unmute track",
  "Silence the selected track, or turn its sound back on.",
  ["silence", "volume off"],
  "muted",
  "mute",
);
registerToggle(
  "track.toggleSolo",
  "Solo / unsolo track",
  "Hear only the selected track, or hear everything again.",
  ["isolate", "only this"],
  "solo",
  "solo",
);
registerToggle(
  "track.toggleLock",
  "Lock / unlock track",
  "Protect the selected track from edits, or allow edits again.",
  ["protect", "freeze", "unlock"],
  "locked",
  "lock",
);
registerToggle(
  "track.toggleHide",
  "Show / hide track",
  "Hide the selected track from the picture, or show it again.",
  ["visibility", "eye", "invisible"],
  "hidden",
  "eye",
);

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
  argsSchema: z.object({ label: z.string().optional() }).optional(),
  when: (ctx) => activeComposition(ctx) !== undefined,
  run: (ctx, args): Op => ({
    type: "addMarker",
    compositionId: ctx.compositionId ?? "",
    marker: {
      id: ctx.services.newId(),
      tUs: ctx.playheadUs,
      durationUs: 0,
      label: args?.label ?? "",
      color: MARKER_COLOR,
    },
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
      .map((m): Op => ({
        type: "removeMarker",
        compositionId: ctx.compositionId ?? "",
        markerId: m.id,
      })),
});

// --- Adding media -----------------------------------------------------------------------------

function mediaLength(asset: Asset, kind: "video" | "audio"): number {
  if (asset.kind === "image") return DEFAULT_IMAGE_US;
  return (
    (kind === "audio" ? asset.audio?.durationUs : asset.video?.durationUs) ??
    asset.audio?.durationUs ??
    DEFAULT_IMAGE_US
  );
}

/** The first unlocked track of this kind with nothing in [start, end), or a new track op for it. */
function trackFor(
  ctx: EditingContext,
  comp: Composition,
  kind: TrackKind,
  start: number,
  end: number,
  ops: Op[],
): string {
  const free = comp.tracks.find(
    (t) =>
      t.kind === kind && !t.locked && t.clips.every((c) => endOf(c) <= start || c.startUs >= end),
  );
  if (free !== undefined) return free.id;
  const op = addTrackOp(ctx, kind);
  ops.push(op);
  return op.type === "addTrack" ? op.track.id : "";
}

editingActions.register({
  id: "timeline.addAssetAtPlayhead",
  title: "Add media at playhead",
  description:
    "Place a library asset on the timeline at the playhead (a video's sound goes on an audio track, linked).",
  keywords: ["insert", "import", "put on timeline", "drop", "place clip"],
  category: "Timeline",
  icon: "upload",
  argsSchema: z.object({
    asset: z.string().describe("Name (or part of it) of a ready asset in the library, or its id"),
  }),
  when: (ctx) => activeComposition(ctx) !== undefined,
  run: (ctx, args): Op[] => {
    const comp = activeComposition(ctx);
    const project = ctx.project;
    if (comp === undefined || project === null) throw new ActionError("Open a composition first.");
    const found = ctx.services.resolveAsset(args.asset);
    if ("error" in found) throw new ActionError(found.error);
    const asset = found.asset;
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
        clip: createClip({
          id,
          type: "media",
          assetId: asset.id,
          startUs: start,
          inUs: 0,
          outUs: length,
          transform: centeredTransform(comp, size),
        }),
      });
    }
    if (asset.kind === "audio" || (asset.kind === "video" && asset.audio !== undefined)) {
      const length = mediaLength(asset, "audio");
      const trackId = trackFor(ctx, comp, "audio", start, start + length, ops);
      const id = ctx.services.newId();
      added.push(id);
      ops.push({
        type: "addClip",
        trackId,
        clip: createClip({
          id,
          type: "media",
          assetId: asset.id,
          startUs: start,
          inUs: 0,
          outUs: length,
        }),
      });
    }
    if (added.length === 2)
      ops.push({ type: "linkClips", clipIds: added, linkId: ctx.services.newId() });
    return ops;
  },
});

// --- Tools and view ---------------------------------------------------------------------------

function registerTool(
  tool: Tool,
  title: string,
  description: string,
  shortcut: string,
  keywords: string[],
  icon: string,
): void {
  editingActions.register({
    id: `tool.${tool}`,
    title,
    description,
    keywords,
    category: "Tools",
    icon,
    shortcut,
    when: (ctx) => activeComposition(ctx) !== undefined,
    run: (ctx) => {
      ctx.services.editor.setTool(tool);
      return undefined;
    },
  });
}

registerTool(
  "select",
  "Selection tool",
  "Select clips, drag them to move, drag their edges to trim.",
  "V",
  ["pointer", "arrow", "move", "default"],
  "select",
);
registerTool(
  "razor",
  "Razor tool",
  "Click a clip to cut it (and clips linked to it) at that point.",
  "C",
  ["cut", "blade", "split", "slice"],
  "split",
);
registerTool(
  "ripple",
  "Ripple trim tool",
  "Drag a clip edge to trim it and pull the later clips along.",
  "B",
  ["ripple", "close gap", "trim and shift"],
  "trim",
);
registerTool(
  "roll",
  "Roll tool",
  "Drag the cut between two clips to move it without changing the total length.",
  "N",
  ["rolling edit", "move cut", "adjust edit point"],
  "trim",
);
registerTool(
  "slip",
  "Slip tool",
  "Drag inside a clip to change which part of the media it shows, keeping its place and length.",
  "Y",
  ["offset content", "shift media"],
  "trim",
);
registerTool(
  "slide",
  "Slide tool",
  "Drag a clip along the track while its neighbours give way to fill the gap.",
  "U",
  ["move between", "shift clip"],
  "trim",
);

function registerView(
  id: string,
  title: string,
  description: string,
  keywords: string[],
  shortcut: string,
  icon: string,
  run: (ctx: EditingContext) => void,
): void {
  editingActions.register({
    id,
    title,
    description,
    keywords,
    category: "Timeline",
    icon,
    shortcut,
    when: (ctx) => activeComposition(ctx) !== undefined,
    run: (ctx) => {
      run(ctx);
      return undefined;
    },
  });
}

registerView(
  "timeline.zoomIn",
  "Zoom in",
  "Show the timeline in more detail.",
  ["magnify", "bigger", "closer"],
  "=",
  "zoomIn",
  (ctx) => {
    ctx.services.editor.zoomBy(1.5);
  },
);
registerView(
  "timeline.zoomOut",
  "Zoom out",
  "Show more of the timeline.",
  ["smaller", "overview", "farther"],
  "-",
  "zoomOut",
  (ctx) => {
    ctx.services.editor.zoomBy(1 / 1.5);
  },
);
registerView(
  "timeline.zoomFit",
  "Zoom to fit",
  "Zoom the timeline so the whole project fits the window.",
  ["fit", "show all", "whole timeline"],
  "\\",
  "fit",
  (ctx) => {
    ctx.services.editor.zoomFit();
  },
);
registerView(
  "timeline.toggleSnapping",
  "Snapping on / off",
  "Make dragged clips and edges stick to nearby edges, markers and the playhead, or not.",
  ["magnet", "snap", "stick", "align"],
  "Shift+S",
  "magnet",
  (ctx) => {
    ctx.services.editor.toggleSnapping();
  },
);

// --- Selection --------------------------------------------------------------------------------

editingActions.register({
  id: "selection.selectAll",
  title: "Select all clips",
  description: "Select every clip in the composition.",
  keywords: ["everything", "all"],
  category: "Edit",
  shortcut: "Mod+A",
  when: (ctx) => {
    const comp = activeComposition(ctx);
    return comp !== undefined && placedClips(comp).length > 0;
  },
  run: (ctx) => {
    const comp = activeComposition(ctx);
    ctx.services.editor.selectClips(
      comp === undefined ? [] : placedClips(comp).map((p) => p.clip.id),
    );
    return undefined;
  },
});

editingActions.register({
  id: "selection.clear",
  title: "Deselect",
  description: "Clear the selection.",
  keywords: ["unselect", "none", "escape"],
  category: "Edit",
  shortcut: "Escape",
  when: (ctx) => ctx.selectedClipIds.length > 0,
  run: (ctx) => {
    ctx.services.editor.selectClips([]);
    return undefined;
  },
});

// --- Playback ---------------------------------------------------------------------------------

editingActions.register({
  id: "playback.playPause",
  title: "Play / pause",
  description: "Start or stop playing the composition from the playhead.",
  keywords: ["play", "pause", "stop", "start", "resume"],
  category: "Playback",
  icon: "play",
  shortcut: "Space",
  when: (ctx) => duration(ctx) > 0,
  run: (ctx) => {
    ctx.services.playback.togglePlay();
    return undefined;
  },
});

function registerStep(
  id: string,
  title: string,
  description: string,
  keywords: string[],
  shortcut: string,
  icon: string,
  target: (ctx: EditingContext) => number,
): void {
  editingActions.register({
    id,
    title,
    description,
    keywords,
    category: "Playback",
    icon,
    shortcut,
    when: (ctx) => duration(ctx) > 0,
    run: (ctx) => {
      ctx.services.playback.seek(target(ctx));
      return undefined;
    },
  });
}

registerStep(
  "playback.stepForward",
  "Next frame",
  "Step the playhead forward by one frame.",
  ["frame", "advance", "nudge"],
  "ArrowRight",
  "stepForward",
  (ctx) => stepTarget(ctx.playheadUs, 1, fpsOf(ctx), duration(ctx)),
);
registerStep(
  "playback.stepBack",
  "Previous frame",
  "Step the playhead back by one frame.",
  ["frame", "rewind", "nudge"],
  "ArrowLeft",
  "stepBack",
  (ctx) => stepTarget(ctx.playheadUs, -1, fpsOf(ctx), duration(ctx)),
);
registerStep(
  "playback.skipForward",
  "Forward 1 second",
  "Jump the playhead forward by one second.",
  ["skip", "jump", "second"],
  "Shift+ArrowRight",
  "skipForward",
  (ctx) => skipTarget(ctx.playheadUs, 1, fpsOf(ctx), duration(ctx)),
);
registerStep(
  "playback.skipBack",
  "Back 1 second",
  "Jump the playhead back by one second.",
  ["skip", "jump", "second"],
  "Shift+ArrowLeft",
  "skipBack",
  (ctx) => skipTarget(ctx.playheadUs, -1, fpsOf(ctx), duration(ctx)),
);
registerStep(
  "playback.goToStart",
  "Go to start",
  "Move the playhead to the beginning.",
  ["beginning", "first", "home"],
  "Home",
  "skipStart",
  () => 0,
);
registerStep(
  "playback.goToEnd",
  "Go to end",
  "Move the playhead to the last frame.",
  ["last", "finish", "end"],
  "End",
  "skipEnd",
  (ctx) => lastFrameUs(duration(ctx), fpsOf(ctx)),
);

function registerMarkerJump(id: string, title: string, shortcut: string, direction: 1 | -1): void {
  const target = (ctx: EditingContext): number | undefined => {
    const times = (activeComposition(ctx)?.markers ?? []).map((m) => m.tUs);
    const candidates =
      direction === 1
        ? times.filter((t) => t > ctx.playheadUs)
        : times.filter((t) => t < ctx.playheadUs);
    return candidates.length === 0
      ? undefined
      : direction === 1
        ? Math.min(...candidates)
        : Math.max(...candidates);
  };
  editingActions.register({
    id,
    title,
    description: `Move the playhead to the ${direction === 1 ? "next" : "previous"} marker.`,
    keywords: ["marker", "jump", direction === 1 ? "next" : "previous", "go to marker"],
    category: "Timeline",
    shortcut,
    when: (ctx) => target(ctx) !== undefined,
    run: (ctx) => {
      const to = target(ctx);
      if (to !== undefined) ctx.services.playback.seek(to);
      return undefined;
    },
  });
}

registerMarkerJump("marker.next", "Go to next marker", "Shift+M", 1);
registerMarkerJump("marker.previous", "Go to previous marker", "Alt+M", -1);

// --- Clipboard --------------------------------------------------------------------------------

editingActions.register({
  id: "clip.copy",
  title: "Copy clips",
  description:
    "Copy the selected clips (and clips linked to them) so they can be pasted at the playhead.",
  keywords: ["duplicate", "clipboard", "ctrl c"],
  category: "Edit",
  icon: "copy",
  shortcut: "Mod+C",
  when: hasSelection,
  run: (ctx) => {
    const comp = activeComposition(ctx);
    if (comp !== undefined)
      ctx.services.clipboard.setClips(copyClips(comp, selectedWithLinked(ctx)));
    return undefined;
  },
});

editingActions.register({
  id: "clip.cut",
  title: "Cut clips",
  description: "Copy the selected clips and remove them, leaving a gap.",
  keywords: ["remove and copy", "move to clipboard", "ctrl x"],
  category: "Edit",
  icon: "trash",
  shortcut: "Mod+X",
  when: hasSelection,
  run: (ctx) => {
    const comp = activeComposition(ctx);
    const ids = selectedWithLinked(ctx);
    if (comp !== undefined) ctx.services.clipboard.setClips(copyClips(comp, ids));
    return ids.map((clipId): Op => ({ type: "removeClip", clipId }));
  },
});

editingActions.register({
  id: "clip.paste",
  title: "Paste clips",
  description:
    "Paste the copied clips with the first one at the playhead, on their own tracks where there is room.",
  keywords: ["insert copy", "put back", "ctrl v"],
  category: "Edit",
  icon: "copy",
  shortcut: "Mod+V",
  when: (ctx) => ctx.hasClipboard && activeComposition(ctx) !== undefined,
  run: (ctx) => {
    const comp = activeComposition(ctx);
    if (comp === undefined || ctx.clipboard === null) return [];
    return pasteOps(comp, ctx.clipboard, ctx.playheadUs, ctx.services.newId);
  },
});

editingActions.register({
  id: "clip.copyAttributes",
  title: "Copy clip attributes",
  description:
    "Copy the look of the selected clip (transform, opacity, blend, crop, colour; or audio settings) to paste onto other clips.",
  keywords: ["copy look", "copy style", "copy settings", "format painter"],
  category: "Edit",
  shortcut: "Mod+Alt+C",
  when: hasSelection,
  run: (ctx) => {
    const comp = activeComposition(ctx);
    const first =
      comp === undefined
        ? undefined
        : placedClips(comp).find((p) => ctx.selectedClipIds.includes(p.clip.id));
    if (first !== undefined)
      ctx.services.clipboard.setAttributes(copyAttributes(first.clip, first.track.kind));
    return undefined;
  },
});

editingActions.register({
  id: "clip.pasteAttributes",
  title: "Paste clip attributes",
  description:
    "Apply the copied look to the selected clips (picture attributes to picture clips, audio to audio clips).",
  keywords: ["paste look", "paste style", "apply settings", "format painter"],
  category: "Edit",
  shortcut: "Mod+Alt+V",
  when: (ctx) => ctx.hasAttributes && hasSelection(ctx),
  run: (ctx) => {
    const comp = activeComposition(ctx);
    return comp === undefined || ctx.attributes === null
      ? []
      : pasteAttributesOps(comp, ctx.attributes, selectedWithLinked(ctx));
  },
});

// --- Everything a gesture can do, available from the palette -----------------------------------

interface SecondsArgs {
  seconds: number;
}
const secondsSchema = (describe: string) =>
  z.object({ seconds: z.number().describe(describe) }) as unknown as z.ZodType<SecondsArgs>;
const toUs = (seconds: number): number => Math.round(seconds * 1_000_000);

editingActions.register({
  id: "playback.goToTime",
  title: "Go to time…",
  description: "Move the playhead to a time, in seconds from the start.",
  keywords: ["seek", "jump to", "timecode", "playhead"],
  category: "Playback",
  argsSchema: secondsSchema("Seconds from the start of the composition"),
  when: (ctx) => activeComposition(ctx) !== undefined,
  run: (ctx, args) => {
    ctx.services.playback.seek(roundToFrame(Math.max(0, toUs(args.seconds)), fpsOf(ctx)));
    return undefined;
  },
});

editingActions.register({
  id: "selection.clipAtPlayhead",
  title: "Select clips at playhead",
  description: "Select every clip the playhead is on (optionally only on one track, by name).",
  keywords: ["pick", "choose clip", "under playhead"],
  category: "Edit",
  argsSchema: z
    .object({ track: z.string().optional().describe("Track name; leave empty for all tracks") })
    .optional(),
  when: (ctx) => activeComposition(ctx) !== undefined,
  run: (ctx, args) => {
    const comp = activeComposition(ctx);
    if (comp === undefined) return undefined;
    const wanted = args?.track?.trim().toLowerCase();
    const hits = placedClips(comp).filter(
      (p) =>
        p.clip.startUs <= ctx.playheadUs &&
        ctx.playheadUs < endOf(p.clip) &&
        (wanted === undefined ||
          wanted === "" ||
          p.track.name.toLowerCase() === wanted ||
          p.track.id === args?.track),
    );
    if (hits.length === 0) throw new ActionError("There is no clip at the playhead.");
    ctx.services.editor.selectClips(hits.map((p) => p.clip.id));
    return undefined;
  },
});

function registerClipJump(id: string, title: string, direction: 1 | -1): void {
  editingActions.register({
    id,
    title,
    description: `Select the ${direction === 1 ? "next" : "previous"} clip and move the playhead to its start.`,
    keywords: ["clip", direction === 1 ? "next" : "previous", "step through clips", "jump"],
    category: "Edit",
    when: (ctx) => clipStartAround(ctx, direction) !== undefined,
    run: (ctx) => {
      const at = clipStartAround(ctx, direction);
      const comp = activeComposition(ctx);
      if (at === undefined || comp === undefined) return undefined;
      ctx.services.editor.selectClips(
        placedClips(comp)
          .filter((p) => p.clip.startUs === at)
          .map((p) => p.clip.id),
      );
      ctx.services.playback.seek(at);
      return undefined;
    },
  });
}

/** The nearest clip start after (or before) the playhead, if any. */
function clipStartAround(ctx: EditingContext, direction: 1 | -1): number | undefined {
  const comp = activeComposition(ctx);
  if (comp === undefined) return undefined;
  const starts = placedClips(comp).map((p) => p.clip.startUs);
  const candidates =
    direction === 1
      ? starts.filter((t) => t > ctx.playheadUs)
      : starts.filter((t) => t < ctx.playheadUs);
  return candidates.length === 0
    ? undefined
    : direction === 1
      ? Math.min(...candidates)
      : Math.max(...candidates);
}

registerClipJump("selection.nextClip", "Select next clip", 1);
registerClipJump("selection.previousClip", "Select previous clip", -1);

editingActions.register({
  id: "clip.moveBy",
  title: "Move clips by…",
  description:
    "Move the selected clips (and clips linked to them) later, or earlier with a negative number, by some seconds.",
  keywords: ["shift", "nudge", "offset", "slide along"],
  category: "Edit",
  argsSchema: secondsSchema("Seconds to move by (negative moves earlier)"),
  when: hasSelection,
  run: (ctx, args) => {
    const comp = activeComposition(ctx);
    if (comp === undefined) return [];
    const ids = new Set(selectedWithLinked(ctx));
    const delta = toUs(args.seconds);
    return placedClips(comp)
      .filter((p) => ids.has(p.clip.id))
      .map((p): Op => ({
        type: "moveClip",
        clipId: p.clip.id,
        trackId: p.track.id,
        startUs: Math.max(0, p.clip.startUs + delta),
      }));
  },
});

function registerTrimTo(id: string, title: string, edge: "start" | "end"): void {
  editingActions.register({
    id,
    title,
    description: `Set where the ${edge} of the selected clips (and clips linked to them) is on the timeline, in seconds.`,
    keywords: [
      "trim",
      "cut to",
      "shorten",
      "lengthen",
      edge === "start" ? "in point" : "out point",
    ],
    category: "Edit",
    argsSchema: secondsSchema("Timeline time in seconds"),
    when: hasSelection,
    run: (ctx, args) =>
      selectedWithLinked(ctx).map((clipId): Op => ({
        type: "trimClip",
        clipId,
        edge,
        toUs: roundToFrame(Math.max(0, toUs(args.seconds)), fpsOf(ctx)),
      })),
  });
}

registerTrimTo("clip.trimStartTo", "Trim start to…", "start");
registerTrimTo("clip.trimEndTo", "Trim end to…", "end");
