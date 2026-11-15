import { TemplateBuilder } from "../builder.ts";
import type { TemplateDefinition } from "./types.ts";

const W = 1920;
const H = 1080;

/** Every lower third sits over a video slot so it can be seen in context. */
export const LOWER_THIRDS: TemplateDefinition[] = [
  {
    id: "lt-classic",
    name: "Classic name bar",
    category: "lowerThirds",
    aspect: "16:9",
    description: "A rounded bar slides in with a name and a role.",
    keywords: ["lower third", "name", "title", "interview", "news", "bar"],
    build: () => {
      const b = new TemplateBuilder("Classic name bar", W, H);
      b.mediaSlot("video", "Your video", { start: 0, end: 6 });
      const bar = b.rect(
        { x: 120, y: 820, w: 760, h: 150 },
        "#111827",
        { start: 0.3, end: 5.5 },
        20,
        { id: "barColor", label: "Bar colour" },
      );
      b.preset(bar, "slideInLeft", { durationS: 0.5 });
      b.preset(bar, "fadeOut", { durationS: 0.4 });
      const accent = b.rect(
        { x: 120, y: 820, w: 14, h: 150 },
        "#22c55e",
        { start: 0.3, end: 5.5 },
        0,
        { id: "accent", label: "Accent colour" },
      );
      b.preset(accent, "slideInLeft", { durationS: 0.5 });
      const name = b.text(
        "Alex Morgan",
        500,
        868,
        { start: 0.5, end: 5.5 },
        { font: "Inter", weight: 700, size: 56 },
        { id: "name", label: "Name" },
      );
      const role = b.text(
        "Product Designer",
        500,
        930,
        { start: 0.7, end: 5.5 },
        { font: "Inter", weight: 400, size: 36, color: "#c7cbd3" },
        { id: "role", label: "Role" },
      );
      b.preset(name, "textFadeUp", { durationS: 0.6 });
      b.preset(role, "textFadeUp", { durationS: 0.6 });
      return b.build();
    },
  },
  {
    id: "lt-minimal-line",
    name: "Minimal line",
    category: "lowerThirds",
    aspect: "16:9",
    description: "A thin line draws itself under a name: quiet and elegant.",
    keywords: ["lower third", "minimal", "line", "elegant", "documentary"],
    build: () => {
      const b = new TemplateBuilder("Minimal line", W, H);
      b.mediaSlot("video", "Your video", { start: 0, end: 6 });
      const line = b.rect(
        { x: 140, y: 930, w: 520, h: 4 },
        "#ffffff",
        { start: 0.2, end: 5.6 },
        0,
        { id: "lineColor", label: "Line colour" },
      );
      b.keys(line, "transform.scale", [
        [0, [0.01, 1]],
        [0.6, [1, 1]],
      ]);
      const name = b.text(
        "Jordan Lee",
        400,
        880,
        { start: 0.5, end: 5.6 },
        { font: "Playfair Display", weight: 400, size: 64 },
        { id: "name", label: "Name" },
      );
      b.preset(name, "textFadeUp", { durationS: 0.8 });
      const place = b.text(
        "Lisbon, Portugal",
        400,
        975,
        { start: 0.8, end: 5.6 },
        { font: "Inter", weight: 400, size: 30, tracking: 120, color: "#e5e7eb" },
        { id: "detail", label: "Detail" },
      );
      b.preset(place, "fadeIn");
      return b.build();
    },
  },
  {
    id: "lt-social-handle",
    name: "Social handle",
    category: "lowerThirds",
    aspect: "16:9",
    description: "A pill with your @handle pops in and bounces out of the way.",
    keywords: ["social", "handle", "instagram", "follow", "lower third", "pill"],
    build: () => {
      const b = new TemplateBuilder("Social handle", W, H);
      b.mediaSlot("video", "Your video", { start: 0, end: 5 });
      const pill = b.rect(
        { x: 1300, y: 900, w: 520, h: 110 },
        "#ffffff",
        { start: 0.4, end: 4.6 },
        55,
        { id: "pillColor", label: "Pill colour" },
      );
      b.preset(pill, "bounceIn", { durationS: 0.7 });
      const handle = b.text(
        "@yourname",
        1560,
        955,
        { start: 0.5, end: 4.6 },
        { font: "Poppins", weight: 700, size: 52, color: "#111111" },
        { id: "handle", label: "Handle" },
      );
      b.preset(handle, "bounceIn", { durationS: 0.7 });
      return b.build();
    },
  },
  {
    id: "lt-breaking",
    name: "Breaking news",
    category: "lowerThirds",
    aspect: "16:9",
    description: "A red label and a headline strip, broadcast style.",
    keywords: ["news", "breaking", "headline", "broadcast", "lower third", "ticker"],
    build: () => {
      const b = new TemplateBuilder("Breaking news", W, H);
      b.mediaSlot("video", "Your video", { start: 0, end: 6 });
      const strip = b.rect({ x: 0, y: 900, w: W, h: 110 }, "#f8fafc", { start: 0.2, end: 6 }, 0);
      b.preset(strip, "slideInRight", { durationS: 0.5 });
      const label = b.rect({ x: 60, y: 880, w: 360, h: 150 }, "#dc2626", { start: 0, end: 6 }, 0, {
        id: "labelColor",
        label: "Label colour",
      });
      b.preset(label, "slideInLeft", { durationS: 0.4 });
      b.text(
        "BREAKING",
        240,
        955,
        { start: 0.2, end: 6 },
        { font: "Bebas Neue", weight: 400, size: 80 },
        { id: "label", label: "Label" },
      );
      const head = b.text(
        "City opens its first car-free street",
        1150,
        955,
        { start: 0.6, end: 6 },
        { font: "Inter", weight: 700, size: 48, color: "#111111" },
        { id: "headline", label: "Headline" },
      );
      b.preset(head, "textTypewriter", { durationS: 1.2 });
      return b.build();
    },
  },
];
