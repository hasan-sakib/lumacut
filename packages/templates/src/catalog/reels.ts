import { TemplateBuilder } from "../builder.ts";
import type { TemplateDefinition } from "./types.ts";

const W = 1080;
const H = 1920;
const CAPTION = {
  font: "Poppins",
  weight: 800,
  size: 64,
  color: "#ffffff",
  stroke: { color: "#000000", width: 6 },
};

export const REELS: TemplateDefinition[] = [
  {
    id: "reel-hook-3cut",
    name: "Hook + 3 cuts",
    category: "reels",
    aspect: "9:16",
    description: "A bold hook title, three quick clips with punch-ins, captions throughout.",
    keywords: ["reel", "tiktok", "shorts", "hook", "captions", "vertical"],
    build: () => {
      const b = new TemplateBuilder("Hook + 3 cuts", W, H);
      const clips = [0, 1, 2].map((i) =>
        b.mediaSlot(`clip${String(i + 1)}`, `Clip ${String(i + 1)}`, {
          start: i * 3,
          end: (i + 1) * 3,
        }),
      );
      clips.forEach((c) => {
        b.preset(c, "zoomPunch", { startS: 0, intensity: 0.6 });
      });
      const hook = b.text(
        "WAIT FOR IT…",
        W / 2,
        420,
        { start: 0, end: 2.5 },
        { font: "Bebas Neue", size: 150, weight: 400, shadow: { color: "#000000cc", blur: 18 } },
        { id: "hook", label: "Hook" },
      );
      b.preset(hook, "pop");
      b.captions(
        "Type what you say here and it appears word by word",
        1500,
        { start: 0, end: 9 },
        CAPTION,
        { id: "captions", label: "Captions" },
      );
      b.audioTrack();
      return b.build();
    },
  },
  {
    id: "reel-before-after",
    name: "Before / after",
    category: "reels",
    aspect: "9:16",
    description: "Split screen that reveals the result: before on top, after below, labelled.",
    keywords: ["before after", "transformation", "split screen", "reveal", "reel"],
    build: () => {
      const b = new TemplateBuilder("Before / after", W, H, "#111111");
      const top = b.mediaSlot(
        "before",
        "Before",
        { start: 0, end: 8 },
        { x: 0, y: 0, w: W, h: H / 2 },
      );
      const bottom = b.mediaSlot(
        "after",
        "After",
        { start: 1, end: 8 },
        { x: 0, y: H / 2, w: W, h: H / 2 },
      );
      b.preset(top, "slideInDown", { durationS: 0.6 });
      b.preset(bottom, "slideInUp", { durationS: 0.6 });
      const label = {
        font: "Poppins",
        weight: 800,
        size: 56,
        background: { color: "#000000aa", padding: 18, radius: 14 },
      };
      b.text("BEFORE", 170, 90, { start: 0.3, end: 8 }, label, {
        id: "label1",
        label: "Top label",
      });
      b.text("AFTER", 150, H / 2 + 90, { start: 1.3, end: 8 }, label, {
        id: "label2",
        label: "Bottom label",
      });
      b.rect({ x: 0, y: H / 2 - 4, w: W, h: 8 }, "#ffffff", { start: 0, end: 8 }, 0, {
        id: "divider",
        label: "Divider colour",
      });
      b.audioTrack();
      return b.build();
    },
  },
  {
    id: "reel-top3",
    name: "Top 3 countdown",
    category: "reels",
    aspect: "9:16",
    description: "Three picks counted down with big numbers and a title card.",
    keywords: ["top 3", "countdown", "list", "ranking", "reel"],
    build: () => {
      const b = new TemplateBuilder("Top 3 countdown", W, H);
      const title = b.text(
        "TOP 3 PLACES",
        W / 2,
        H / 2,
        { start: 0, end: 2 },
        { font: "Bebas Neue", weight: 400, size: 170 },
        { id: "title", label: "Title" },
      );
      b.preset(title, "textWordsIn", { durationS: 0.8 });
      ["3", "2", "1"].forEach((n, i) => {
        const start = 2 + i * 3;
        b.mediaSlot(`pick${n}`, `Pick #${n}`, { start, end: start + 3 });
        const number = b.text(
          `#${n}`,
          170,
          260,
          { start, end: start + 3 },
          {
            font: "Bebas Neue",
            weight: 400,
            size: 220,
            color: "#ffd60a",
            shadow: { color: "#000000aa", blur: 20 },
          },
        );
        b.preset(number, "bounceIn", { durationS: 0.6 });
        b.text(
          `Name of pick ${n}`,
          W / 2,
          1640,
          { start, end: start + 3 },
          { size: 60, background: { color: "#000000aa", padding: 20, radius: 16 } },
          { id: `name${n}`, label: `Pick #${n} name` },
        );
      });
      b.audioTrack();
      return b.build();
    },
  },
  {
    id: "reel-quote-broll",
    name: "Talking point",
    category: "reels",
    aspect: "9:16",
    description: "Your video full-screen with a headline bar and karaoke captions.",
    keywords: ["talking head", "podcast clip", "captions", "headline", "reel"],
    build: () => {
      const b = new TemplateBuilder("Talking point", W, H);
      b.mediaSlot("video", "Your video", { start: 0, end: 15 });
      const bar = b.rect(
        { x: 60, y: 200, w: W - 120, h: 170 },
        "#ff3b6b",
        { start: 0, end: 15 },
        24,
        { id: "barColor", label: "Headline colour" },
      );
      b.preset(bar, "slideInLeft", { durationS: 0.5 });
      const head = b.text(
        "The one tip nobody tells you",
        W / 2,
        285,
        { start: 0.2, end: 15 },
        { size: 58, weight: 800, width: W - 180 },
        { id: "headline", label: "Headline" },
      );
      b.preset(head, "textFadeUp", { durationS: 0.8 });
      b.captions(
        "Paste your transcript here and the captions follow along",
        1480,
        { start: 0, end: 15 },
        { ...CAPTION, background: undefined },
        { id: "captions", label: "Captions" },
      );
      b.audioTrack();
      return b.build();
    },
  },
  {
    id: "reel-promo",
    name: "Product promo",
    category: "reels",
    aspect: "9:16",
    description: "Product shots, a price tag that pops, and a call to action.",
    keywords: ["promo", "product", "sale", "ad", "price", "shop", "reel"],
    build: () => {
      const b = new TemplateBuilder("Product promo", W, H, "#0d0d12");
      const a = b.mediaSlot("shot1", "Product shot 1", { start: 0, end: 4 });
      b.keys(a, "transform.scale", [
        [0, [1, 1]],
        [4, [1.12, 1.12]],
      ]);
      const c = b.mediaSlot("shot2", "Product shot 2", { start: 4, end: 8 });
      b.keys(c, "transform.scale", [
        [0, [1.12, 1.12]],
        [4, [1, 1]],
      ]);
      const tag = b.rect(
        { x: W - 420, y: 1250, w: 360, h: 160 },
        "#ffd60a",
        { start: 1, end: 8 },
        30,
        { id: "tagColor", label: "Tag colour" },
      );
      b.preset(tag, "pop");
      const price = b.text(
        "$29",
        W - 240,
        1330,
        { start: 1, end: 8 },
        { font: "Bebas Neue", weight: 400, size: 130, color: "#111111" },
        { id: "price", label: "Price" },
      );
      b.preset(price, "pop");
      const cta = b.text(
        "SHOP NOW",
        W / 2,
        1700,
        { start: 5, end: 8 },
        { size: 80, weight: 800, background: { color: "#ff3b6b", padding: 28, radius: 40 } },
        { id: "cta", label: "Call to action" },
      );
      b.preset(cta, "bounceIn");
      b.audioTrack();
      return b.build();
    },
  },
];
