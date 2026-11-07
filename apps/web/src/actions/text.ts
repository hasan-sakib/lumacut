import { ActionError } from "@lumacut/actions";
import { createClip, type Composition, type Op } from "@lumacut/schema";
import * as z from "zod";
import { wordsFromText } from "../captions/words.ts";
import { parseCues, wordsFromCues } from "../captions/srt.ts";
import { CAPTION_STYLES, applyCaptionStyle, captionStyleById } from "../captions/styles.ts";
import { defaultTextData, withContent } from "../text/defaults.ts";
import { placedClips } from "../timeline/clips.ts";
import { activeComposition, editingActions, trackFor, type EditingContext } from "./editing.ts";

const US = 1_000_000;
const centered = (comp: Composition) => ({
  x: comp.width / 2,
  y: comp.height / 2,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  anchorX: 0,
  anchorY: 0,
  skew: 0,
});

function need(ctx: EditingContext): Composition {
  const comp = activeComposition(ctx);
  if (comp === undefined) throw new ActionError("Open a composition first.");
  return comp;
}

/** Unlocked text/caption clips in the selection. */
function selectedOf(ctx: EditingContext, type: "text" | "caption") {
  const comp = activeComposition(ctx);
  if (comp === undefined) return [];
  const wanted = new Set(ctx.selectedClipIds);
  return placedClips(comp).filter(
    (p) => wanted.has(p.clip.id) && !p.track.locked && p.clip.type === type,
  );
}

editingActions.register({
  id: "text.add",
  title: "Add text",
  description:
    "Add a title at the playhead. Edit the words, font and colour in the Inspector, and move it with Position.",
  keywords: ["text", "title", "caption", "heading", "words", "lower third", "type"],
  category: "Text",
  icon: "text",
  argsSchema: z.object({
    text: z.string().optional().describe("The words (default “Your text”)"),
    seconds: z.number().min(0.1).max(3600).optional().describe("Length in seconds (default 5)"),
  }),
  when: (ctx) => activeComposition(ctx) !== undefined,
  run: (ctx, args): Op[] => {
    const comp = need(ctx);
    const { text, seconds } = args;
    const length = Math.round((seconds ?? 5) * US);
    const ops: Op[] = [];
    const trackId = trackFor(ctx, comp, "visual", ctx.playheadUs, ctx.playheadUs + length, ops);
    ops.push({
      type: "addClip",
      trackId,
      clip: createClip({
        id: ctx.services.newId(),
        type: "text",
        startUs: ctx.playheadUs,
        inUs: 0,
        outUs: length,
        transform: centered(comp),
        text: defaultTextData(comp, text ?? "Your text"),
      }),
    });
    return ops;
  },
});

editingActions.register({
  id: "text.setContent",
  title: "Change the text",
  description: "Replace the words of the selected text clips (their look is kept).",
  keywords: ["text", "edit text", "change words", "rename title", "retype"],
  category: "Text",
  argsSchema: z.object({ text: z.string().min(1) }),
  when: (ctx) => selectedOf(ctx, "text").length > 0,
  run: (ctx, args): Op[] => {
    const { text } = args;
    return selectedOf(ctx, "text").flatMap(({ clip }) =>
      clip.text === undefined
        ? []
        : [
            {
              type: "setProps" as const,
              clipId: clip.id,
              props: { text: withContent(clip.text, text) },
            },
          ],
    );
  },
});

function captionClip(
  ctx: EditingContext,
  comp: Composition,
  words: ReturnType<typeof wordsFromText>,
  durationUs: number,
): Op[] {
  const styled = applyCaptionStyle(CAPTION_STYLES[0] ?? fail(), comp, { words });
  const ops: Op[] = [];
  const trackId = trackFor(ctx, comp, "visual", ctx.playheadUs, ctx.playheadUs + durationUs, ops);
  ops.push({
    type: "addClip",
    trackId,
    clip: createClip({
      id: ctx.services.newId(),
      type: "caption",
      startUs: ctx.playheadUs,
      inUs: 0,
      outUs: durationUs,
      // Bottom of the picture, centred; the text is centred on this point.
      transform: { ...centered(comp), y: Math.round(comp.height * 0.84) },
      text: styled.text,
      caption: styled.caption,
    }),
  });
  return ops;
}

function fail(): never {
  throw new ActionError("There are no caption styles.");
}

editingActions.register({
  id: "caption.add",
  title: "Add captions from text",
  description:
    "Add a caption clip at the playhead from pasted text. The words are timed evenly over its length; adjust each word's timing in the Inspector.",
  keywords: ["caption", "subtitle", "transcript", "paste text", "words", "karaoke"],
  category: "Text",
  argsSchema: z.object({
    text: z.string().min(1).describe("The words to show"),
    seconds: z
      .number()
      .min(0.5)
      .max(3600)
      .optional()
      .describe("Length in seconds (default 0.4 s a word)"),
  }),
  when: (ctx) => activeComposition(ctx) !== undefined,
  run: (ctx, args): Op[] => {
    const comp = need(ctx);
    const { text, seconds } = args;
    const count = text.split(/\s+/).filter(Boolean).length;
    if (count === 0) throw new ActionError("Type or paste the words to caption.");
    const durationUs = Math.round((seconds ?? Math.max(2, count * 0.4)) * US);
    return captionClip(ctx, comp, wordsFromText(text, durationUs), durationUs);
  },
});

editingActions.register({
  id: "caption.importSrt",
  title: "Import captions (SRT / VTT)",
  description:
    "Add a caption clip at the playhead from the contents of an .srt or .vtt subtitle file. Each cue's words are timed across the cue.",
  keywords: ["srt", "vtt", "subtitles", "captions", "import", "subtitle file", "webvtt"],
  category: "Text",
  argsSchema: z.object({
    subtitles: z.string().min(1).describe("The text of the .srt or .vtt file"),
  }),
  when: (ctx) => activeComposition(ctx) !== undefined,
  run: (ctx, args): Op[] => {
    const comp = need(ctx);
    const { subtitles } = args;
    const cues = parseCues(subtitles);
    if (cues.length === 0) {
      throw new ActionError(
        "No captions found. The file should have lines like “00:00:01,000 --> 00:00:03,500” followed by the words.",
      );
    }
    const { words, durationUs } = wordsFromCues(cues);
    return captionClip(ctx, comp, words, durationUs);
  },
});

editingActions.register({
  id: "caption.applyStyle",
  title: "Apply a caption style",
  description:
    "Style the selected caption clips: " +
    CAPTION_STYLES.map((s) => `${s.id} (${s.name}: ${s.description})`).join("; "),
  keywords: ["caption", "style", "subtitle style", "karaoke", "font", "look"],
  category: "Text",
  argsSchema: z.object({ style: z.enum(CAPTION_STYLES.map((s) => s.id) as [string, ...string[]]) }),
  when: (ctx) => selectedOf(ctx, "caption").length > 0,
  run: (ctx, args): Op[] => {
    const comp = need(ctx);
    const { style } = args;
    const found = captionStyleById(style);
    if (found === undefined) throw new ActionError(`There is no caption style "${style}".`);
    return selectedOf(ctx, "caption").flatMap(({ clip }) => {
      if (clip.caption === undefined) return [];
      const styled = applyCaptionStyle(found, comp, clip.caption);
      return [{ type: "setProps" as const, clipId: clip.id, props: styled }];
    });
  },
});
