import { TemplateBuilder } from "../builder.ts";
import type { TemplateDefinition } from "./types.ts";

const W = 1920;
const H = 1080;

export const INTROS: TemplateDefinition[] = [
  {
    id: "intro-clean-title",
    name: "Clean title",
    category: "intros",
    aspect: "16:9",
    description: "Your footage softly zooms while a title types itself out.",
    keywords: ["intro", "title", "opener", "youtube", "typewriter"],
    build: () => {
      const b = new TemplateBuilder("Clean title", W, H);
      const bg = b.mediaSlot("background", "Background video", { start: 0, end: 5 });
      b.keys(bg, "transform.scale", [
        [0, [1.08, 1.08]],
        [5, [1, 1]],
      ]);
      b.preset(bg, "fadeIn", { durationS: 0.6 });
      const title = b.text(
        "Your Channel Name",
        W / 2,
        H / 2,
        { start: 0.5, end: 5 },
        { font: "Montserrat", weight: 700, size: 110, shadow: { color: "#00000099", blur: 24 } },
        { id: "title", label: "Title" },
      );
      b.preset(title, "textTypewriter", { durationS: 1.4 });
      b.preset(title, "fadeOut", { durationS: 0.5 });
      return b.build();
    },
  },
  {
    id: "intro-bold-bars",
    name: "Bold bars",
    category: "intros",
    aspect: "16:9",
    description: "Two colour bars sweep in and reveal a big headline.",
    keywords: ["intro", "bars", "graphic", "bold", "opener", "motion"],
    build: () => {
      const b = new TemplateBuilder("Bold bars", W, H, "#101014");
      const bar1 = b.rect({ x: 0, y: 380, w: W, h: 160 }, "#ff3b6b", { start: 0, end: 4 }, 0, {
        id: "color1",
        label: "Bar colour 1",
      });
      const bar2 = b.rect({ x: 0, y: 540, w: W, h: 160 }, "#3b82f6", { start: 0.15, end: 4 }, 0, {
        id: "color2",
        label: "Bar colour 2",
      });
      b.preset(bar1, "slideInLeft", { durationS: 0.6, intensity: 4 });
      b.preset(bar2, "slideInRight", { durationS: 0.6, intensity: 4 });
      const t1 = b.text(
        "BIG",
        W / 2,
        460,
        { start: 0.5, end: 4 },
        { font: "Bebas Neue", weight: 400, size: 150 },
        { id: "line1", label: "Line 1" },
      );
      const t2 = b.text(
        "NEWS TODAY",
        W / 2,
        620,
        { start: 0.7, end: 4 },
        { font: "Bebas Neue", weight: 400, size: 150 },
        { id: "line2", label: "Line 2" },
      );
      b.preset(t1, "pop");
      b.preset(t2, "pop");
      return b.build();
    },
  },
  {
    id: "intro-glitch",
    name: "Glitch logo",
    category: "intros",
    aspect: "16:9",
    description: "A logo or wordmark glitches onto a dark background.",
    keywords: ["glitch", "logo", "tech", "gaming", "intro", "digital"],
    build: () => {
      const b = new TemplateBuilder("Glitch logo", W, H, "#05060a");
      const logo = b.mediaSlot(
        "logo",
        "Logo (image)",
        { start: 0, end: 4 },
        { x: W / 2 - 300, y: H / 2 - 300, w: 600, h: 600 },
      );
      b.preset(logo, "glitch", { startS: 0, durationS: 0.6 });
      b.preset(logo, "fadeIn", { durationS: 0.3 });
      const name = b.text(
        "STUDIO NAME",
        W / 2,
        H / 2 + 380,
        { start: 0.8, end: 4 },
        { font: "Roboto Mono", weight: 700, size: 64, tracking: 200, color: "#7cf9ff" },
        { id: "name", label: "Name" },
      );
      b.preset(name, "textTypewriter", { durationS: 1 });
      return b.build();
    },
  },
  {
    id: "intro-handwritten",
    name: "Handwritten hello",
    category: "intros",
    aspect: "16:9",
    description: "A warm handwritten greeting over your photo, for vlogs and family videos.",
    keywords: ["vlog", "handwritten", "hello", "family", "warm", "intro"],
    build: () => {
      const b = new TemplateBuilder("Handwritten hello", W, H);
      const bg = b.mediaSlot("photo", "Photo or video", { start: 0, end: 5 });
      b.keys(bg, "transform.scale", [
        [0, [1, 1]],
        [5, [1.1, 1.1]],
      ]);
      const hi = b.text(
        "hello there",
        W / 2,
        H / 2,
        { start: 0.4, end: 5 },
        { font: "Caveat", weight: 700, size: 190, shadow: { color: "#00000080", blur: 16 } },
        { id: "greeting", label: "Greeting" },
      );
      b.preset(hi, "textFadeUp", { durationS: 1.2 });
      const sub = b.text(
        "a summer story",
        W / 2,
        H / 2 + 150,
        { start: 1.2, end: 5 },
        { font: "Playfair Display", weight: 400, italic: true, size: 56 },
        { id: "subtitle", label: "Subtitle" },
      );
      b.preset(sub, "fadeIn");
      return b.build();
    },
  },
];
