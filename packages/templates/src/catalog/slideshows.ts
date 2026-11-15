import { TemplateBuilder } from "../builder.ts";
import type { TemplateDefinition } from "./types.ts";

/** Ken Burns: each photo drifts and zooms slowly. */
function kenBurns(b: TemplateBuilder, count: number, each: number, captions: boolean): void {
  for (let i = 0; i < count; i += 1) {
    const start = i * each;
    const photo = b.mediaSlot(`photo${String(i + 1)}`, `Photo ${String(i + 1)}`, {
      start,
      end: start + each + 0.5,
    });
    const zoomIn = i % 2 === 0;
    b.keys(
      photo,
      "transform.scale",
      [
        [0, zoomIn ? [1, 1] : [1.15, 1.15]],
        [each + 0.5, zoomIn ? [1.15, 1.15] : [1, 1]],
      ],
      false,
    );
    if (i > 0) b.preset(photo, "fadeIn", { durationS: 0.5 });
    if (captions) {
      const caption = b.text(
        `Caption ${String(i + 1)}`,
        b.width / 2,
        b.height - 120,
        { start: start + 0.3, end: start + each },
        {
          font: "Playfair Display",
          weight: 400,
          italic: true,
          size: 54,
          shadow: { color: "#000000aa", blur: 12 },
        },
        { id: `caption${String(i + 1)}`, label: `Caption ${String(i + 1)}` },
      );
      b.preset(caption, "textFadeUp", { durationS: 0.7 });
    }
  }
}

export const SLIDESHOWS: TemplateDefinition[] = [
  {
    id: "slides-memories",
    name: "Memories",
    category: "slideshows",
    aspect: "16:9",
    description: "Six photos with slow zooms, cross-fades and a caption each.",
    keywords: ["slideshow", "memories", "photos", "ken burns", "family", "wedding"],
    build: () => {
      const b = new TemplateBuilder("Memories", 1920, 1080);
      kenBurns(b, 6, 3, true);
      const title = b.text(
        "Our Year",
        960,
        540,
        { start: 0.2, end: 2.8 },
        {
          font: "Playfair Display",
          weight: 400,
          size: 130,
          shadow: { color: "#000000aa", blur: 20 },
        },
        { id: "title", label: "Title" },
      );
      b.preset(title, "textFadeUp", { durationS: 1 });
      b.audioTrack();
      return b.build();
    },
  },
  {
    id: "slides-square-grid",
    name: "Square photo dump",
    category: "slideshows",
    aspect: "1:1",
    description: "Square posts: eight photos, quick cuts with a pop, for a carousel-style video.",
    keywords: ["photo dump", "square", "instagram", "carousel", "slideshow", "quick"],
    build: () => {
      const b = new TemplateBuilder("Square photo dump", 1080, 1080, "#ffffff");
      for (let i = 0; i < 8; i += 1) {
        const photo = b.mediaSlot(
          `photo${String(i + 1)}`,
          `Photo ${String(i + 1)}`,
          { start: i * 1.2, end: (i + 1) * 1.2 },
          { x: 60, y: 60, w: 960, h: 960 },
        );
        b.preset(photo, "pop", { durationS: 0.35, intensity: 0.5 });
      }
      b.audioTrack();
      return b.build();
    },
  },
  {
    id: "slides-travel",
    name: "Travel diary",
    category: "slideshows",
    aspect: "16:9",
    description: "Five places with a big location name sliding in on each.",
    keywords: ["travel", "trip", "vacation", "places", "slideshow", "diary"],
    build: () => {
      const b = new TemplateBuilder("Travel diary", 1920, 1080);
      for (let i = 0; i < 5; i += 1) {
        const start = i * 3.5;
        const photo = b.mediaSlot(`place${String(i + 1)}`, `Place ${String(i + 1)}`, {
          start,
          end: start + 3.5,
        });
        b.keys(
          photo,
          "transform.position",
          [
            [0, [920, 540]],
            [3.5, [1000, 540]],
          ],
          false,
        );
        b.keys(
          photo,
          "transform.scale",
          [
            [0, [1.1, 1.1]],
            [3.5, [1.1, 1.1]],
          ],
          false,
        );
        const name = b.text(
          `PLACE ${String(i + 1)}`,
          960,
          540,
          { start: start + 0.3, end: start + 3.3 },
          {
            font: "Bebas Neue",
            weight: 400,
            size: 200,
            tracking: 80,
            shadow: { color: "#00000099", blur: 30 },
          },
          { id: `name${String(i + 1)}`, label: `Place ${String(i + 1)} name` },
        );
        b.preset(name, "slideInUp", { durationS: 0.6 });
        b.preset(name, "fadeOut", { durationS: 0.4 });
      }
      b.audioTrack();
      return b.build();
    },
  },
  {
    id: "slides-portfolio",
    name: "Portfolio",
    category: "slideshows",
    aspect: "16:9",
    description: "Work samples framed on a coloured backdrop with project titles.",
    keywords: ["portfolio", "showcase", "work", "design", "slideshow", "frame"],
    build: () => {
      const b = new TemplateBuilder("Portfolio", 1920, 1080);
      b.fill("#f1ece4", { start: 0, end: 16 }, { id: "backdrop", label: "Backdrop colour" });
      for (let i = 0; i < 4; i += 1) {
        const start = i * 4;
        const work = b.mediaSlot(
          `work${String(i + 1)}`,
          `Work ${String(i + 1)}`,
          { start, end: start + 4 },
          { x: 160, y: 120, w: 1100, h: 840 },
        );
        b.preset(work, "slideInRight", { durationS: 0.6 });
        const title = b.text(
          `Project ${String(i + 1)}`,
          1580,
          480,
          { start: start + 0.4, end: start + 4 },
          {
            font: "Montserrat",
            weight: 700,
            size: 64,
            color: "#1f2937",
            width: 520,
            align: "left",
          },
          { id: `title${String(i + 1)}`, label: `Project ${String(i + 1)} title` },
        );
        b.preset(title, "textFadeUp", { durationS: 0.7 });
      }
      return b.build();
    },
  },
];
