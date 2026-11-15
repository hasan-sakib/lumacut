import { EFFECTS, TRANSITIONS } from "@lumacut/effects";
import { BUILTIN_LUTS } from "@lumacut/engine/color";
import { MOTION_PRESETS } from "@lumacut/ops";
import { TEMPLATES } from "@lumacut/templates";

/** What the product has today, counted from the product itself (never typed by hand). */
export const COUNTS = {
  templates: TEMPLATES.length,
  effects: EFFECTS.length,
  transitions: TRANSITIONS.length,
  looks: BUILTIN_LUTS.length,
  presets: MOTION_PRESETS.length,
};

export const SECTIONS = [
  { id: "features", label: "Features" },
  { id: "templates", label: "Templates" },
  { id: "effects", label: "Effects" },
  { id: "how", label: "How it works" },
  { id: "faq", label: "FAQ" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

export const TOOLS = [
  {
    id: "video",
    label: "Video",
    icon: "video",
    title: "A real timeline, not a toy",
    text: "Cut and arrange on as many tracks as you need, with the trimming tools editors expect.",
    points: [
      "Multi-track timeline with razor, ripple, roll, slip and slide",
      `${String(TRANSITIONS.length)} transitions and ${String(EFFECTS.length)} effects, each with its own controls`,
      "Speed changes that keep the pitch, and a full audio mixer",
      "Captions from your text, timed and styled",
    ],
  },
  {
    id: "motion",
    label: "Motion",
    icon: "keyframe",
    title: "Animate anything with keyframes",
    text: "Every property that has a number can move. Shape the timing in the graph editor.",
    points: [
      "One keyframe control on every property, with a graph editor for easing",
      `${String(MOTION_PRESETS.length)} motion presets that become editable keyframes`,
      "Shapes, a pen tool, masks and track mattes",
      "Animated text, word by word or letter by letter",
    ],
  },
  {
    id: "photo",
    label: "Photo",
    icon: "image",
    title: "Photo editing in the same project",
    text: "Layers, brushes and selections, drawn by the same engine that renders your video.",
    points: [
      "Layers with blend modes, opacity, groups and masks",
      "Brush, eraser, marquee and lasso selections, crop and canvas resize",
      `${String(BUILTIN_LUTS.length)} looks and every video effect, as removable filters`,
      "Export PNG, JPEG or WebP at full size",
    ],
  },
] as const;

export const STEPS = [
  {
    icon: "upload",
    title: "Import",
    text: "Drop in videos, photos and music, or start from a template. Files upload in the background and land on the timeline when ready.",
  },
  {
    icon: "split",
    title: "Edit",
    text: "Cut, animate, grade and caption. Simple mode keeps it to the essentials; Pro shows every control. Switch whenever you like.",
  },
  {
    icon: "download",
    title: "Export",
    text: "Render in the browser for short pieces or on the server for long ones: MP4, WebM, GIF or MP3, and PNG, JPEG or WebP for photos.",
  },
] as const;

export const FEATURES = [
  {
    icon: "graph",
    title: "Keyframes and graph editor",
    text: "Linear, hold and bezier easing, edited as curves.",
  },
  {
    icon: "lut",
    title: "Colour grading and scopes",
    text: "Wheels, curves, HSL, .cube LUTs, with waveform and vectorscope.",
  },
  {
    icon: "audio",
    title: "Audio mixer",
    text: "Levels, pan, EQ, compressor, reverb and loudness metering.",
  },
  {
    icon: "text",
    title: "Text and captions",
    text: "Styled titles, animated text and word-timed captions.",
  },
  {
    icon: "shape",
    title: "Shapes and masks",
    text: "Vector shapes, a pen tool, feathered and painted masks.",
  },
  {
    icon: "command",
    title: "Command palette",
    text: "Every feature is one search away, and has a shortcut.",
  },
  {
    icon: "sliders",
    title: "Simple and Pro modes",
    text: "Big buttons when you want speed, full panels when you want control.",
  },
  {
    icon: "clock",
    title: "Autosave and history",
    text: "Projects save as you work, with undo history and saved versions.",
  },
] as const;

export const COMING = [
  {
    title: "AI analysis",
    text: "Transcripts, shot detection and beat tracking for your footage.",
  },
  {
    title: "AI tools",
    text: "Tools that propose edits you preview and approve, never changes behind your back.",
  },
  {
    title: "Auto-edit",
    text: "Turn a long recording into a short styled reel, then refine it by hand.",
  },
] as const;

export const FAQ = [
  {
    q: "Do I need to install anything?",
    a: "No. Lumacut runs in the browser. Create an account and start a project.",
  },
  {
    q: "Which browsers work?",
    a: "The latest Chrome or Edge on a computer. The editor needs WebCodecs and WebGL 2, which other browsers don't fully support yet.",
  },
  {
    q: "What can I import and export?",
    a: "Import video, audio and images. Export video as MP4 or WebM, animations as GIF, sound as MP3, and photos as PNG, JPEG or WebP. Video goes up to 1080p at 60 frames per second.",
  },
  {
    q: "Where are my files kept?",
    a: "Files you import are uploaded to your library on the server this site runs on, and projects save automatically while you edit.",
  },
  {
    q: "What does it cost?",
    a: "No plans or prices have been set yet.",
  },
  {
    q: "Does it have AI editing?",
    a: "Not yet. AI analysis, AI tools and auto-edit are planned next; everything described above the “Coming next” section works without them.",
  },
] as const;
