import { TemplateBuilder } from "../builder.ts";
import type { TemplateDefinition } from "./types.ts";

export const QUOTE_CARDS: TemplateDefinition[] = [
  {
    id: "quote-serif",
    name: "Serif quote",
    category: "quoteCards",
    aspect: "1:1",
    description: "A quote in a classic serif with an author line, on a colour you choose.",
    keywords: ["quote", "serif", "square", "post", "inspiration", "text"],
    build: () => {
      const b = new TemplateBuilder("Serif quote", 1080, 1080);
      b.fill("#1e293b", { start: 0, end: 6 }, { id: "background", label: "Background colour" });
      b.text(
        "“",
        540,
        250,
        { start: 0, end: 6 },
        { font: "Playfair Display", weight: 400, size: 260, color: "#fbbf24" },
      );
      const quote = b.text(
        "Simplicity is the ultimate sophistication.",
        540,
        520,
        { start: 0.3, end: 6 },
        { font: "Playfair Display", weight: 400, size: 72, width: 860, lineHeight: 1.25 },
        { id: "quote", label: "Quote" },
      );
      b.preset(quote, "textFadeUp", { durationS: 1.4 });
      const author = b.text(
        "— Author Name",
        540,
        820,
        { start: 1.6, end: 6 },
        { font: "Inter", weight: 400, size: 40, color: "#cbd5e1" },
        { id: "author", label: "Author" },
      );
      b.preset(author, "fadeIn");
      return b.build();
    },
  },
  {
    id: "quote-photo",
    name: "Quote on photo",
    category: "quoteCards",
    aspect: "4:5",
    description: "Portrait card: your photo, darkened, with a bold quote typed over it.",
    keywords: ["quote", "photo", "portrait", "4:5", "instagram", "bold"],
    build: () => {
      const b = new TemplateBuilder("Quote on photo", 1080, 1350);
      const photo = b.mediaSlot("photo", "Photo", { start: 0, end: 7 });
      b.keys(
        photo,
        "transform.scale",
        [
          [0, [1, 1]],
          [7, [1.08, 1.08]],
        ],
        false,
      );
      b.rect({ x: 0, y: 0, w: 1080, h: 1350 }, "#00000080", { start: 0, end: 7 });
      const quote = b.text(
        "Do one thing every day that scares you.",
        540,
        640,
        { start: 0.4, end: 7 },
        { font: "Poppins", weight: 800, size: 84, width: 900, lineHeight: 1.2 },
        { id: "quote", label: "Quote" },
      );
      b.preset(quote, "textTypewriter", { durationS: 2.2 });
      b.text(
        "@yourname",
        540,
        1220,
        { start: 2.6, end: 7 },
        { font: "Inter", weight: 400, size: 36, color: "#e5e7eb" },
        { id: "handle", label: "Handle" },
      );
      return b.build();
    },
  },
  {
    id: "quote-split-colour",
    name: "Colour block quote",
    category: "quoteCards",
    aspect: "1:1",
    description: "Two colour blocks slide together behind a short, punchy statement.",
    keywords: ["quote", "colour block", "statement", "square", "bold", "graphic"],
    build: () => {
      const b = new TemplateBuilder("Colour block quote", 1080, 1080, "#ffffff");
      const top = b.rect({ x: 0, y: 0, w: 1080, h: 540 }, "#ff3b6b", { start: 0, end: 6 }, 0, {
        id: "color1",
        label: "Top colour",
      });
      const bottom = b.rect({ x: 0, y: 540, w: 1080, h: 540 }, "#111827", { start: 0, end: 6 }, 0, {
        id: "color2",
        label: "Bottom colour",
      });
      b.preset(top, "slideInDown", { durationS: 0.6, intensity: 4 });
      b.preset(bottom, "slideInUp", { durationS: 0.6, intensity: 4 });
      const l1 = b.text(
        "WORK HARD.",
        540,
        420,
        { start: 0.6, end: 6 },
        { font: "Bebas Neue", weight: 400, size: 170 },
        { id: "line1", label: "Line 1" },
      );
      const l2 = b.text(
        "BE KIND.",
        540,
        660,
        { start: 0.9, end: 6 },
        { font: "Bebas Neue", weight: 400, size: 170 },
        { id: "line2", label: "Line 2" },
      );
      b.preset(l1, "pop");
      b.preset(l2, "pop");
      return b.build();
    },
  },
];
