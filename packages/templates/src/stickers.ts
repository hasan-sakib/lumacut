import type { ShapeData } from "@lumacut/schema";
import { hex } from "./builder.ts";

export interface Sticker {
  id: string;
  name: string;
  keywords: readonly string[];
  /** A shape sticker, or text (emoji) when `text` is set. */
  shape?: ShapeData;
  text?: string;
}

const v = (x: number, y: number) => ({
  point: [x, y] as [number, number],
  inTangent: [0, 0] as [number, number],
  outTangent: [0, 0] as [number, number],
});

/** Built-in stickers: simple shapes and emoji, all ordinary editable layers once added. */
export const STICKERS: readonly Sticker[] = [
  {
    id: "arrow",
    name: "Arrow",
    keywords: ["arrow", "point", "pointer", "look"],
    shape: {
      items: [
        {
          kind: "path",
          id: "p",
          path: {
            closed: true,
            vertices: [
              v(-150, -40),
              v(40, -40),
              v(40, -100),
              v(150, 0),
              v(40, 100),
              v(40, 40),
              v(-150, 40),
            ],
          },
        },
      ],
      fill: { color: hex("#ffd60a"), rule: "nonzero" },
      stroke: { color: hex("#111111"), width: 8, cap: "round", join: "round", dash: [] },
    },
  },
  {
    id: "burst",
    name: "Burst",
    keywords: ["burst", "star", "sale", "new", "explosion"],
    shape: {
      items: [
        {
          kind: "star",
          id: "s",
          position: [0, 0],
          points: 12,
          innerRadius: 110,
          outerRadius: 160,
          innerRoundness: 0,
          outerRoundness: 0,
          rotation: 0,
        },
      ],
      fill: { color: hex("#ff3b6b"), rule: "nonzero" },
    },
  },
  {
    id: "bubble",
    name: "Speech bubble",
    keywords: ["speech", "bubble", "talk", "comic", "say"],
    shape: {
      items: [
        { kind: "rect", id: "r", position: [0, 0], size: [380, 220], roundness: 60 },
        {
          kind: "path",
          id: "t",
          path: { closed: true, vertices: [v(-80, 100), v(-20, 100), v(-110, 170)] },
        },
      ],
      fill: { color: hex("#ffffff"), rule: "nonzero" },
      stroke: { color: hex("#111111"), width: 6, cap: "round", join: "round", dash: [] },
    },
  },
  {
    id: "circle",
    name: "Circle highlight",
    keywords: ["circle", "highlight", "ring", "look here"],
    shape: {
      items: [{ kind: "ellipse", id: "e", position: [0, 0], size: [320, 320] }],
      stroke: { color: hex("#ff3b6b"), width: 14, cap: "round", join: "round", dash: [] },
    },
  },
  {
    id: "check",
    name: "Check mark",
    keywords: ["check", "tick", "done", "yes", "correct"],
    shape: {
      items: [
        {
          kind: "path",
          id: "p",
          path: { closed: false, vertices: [v(-110, 0), v(-30, 80), v(120, -90)] },
        },
      ],
      stroke: { color: hex("#22c55e"), width: 34, cap: "round", join: "round", dash: [] },
    },
  },
  {
    id: "tag",
    name: "Price tag",
    keywords: ["price", "tag", "label", "sale", "badge"],
    shape: {
      items: [{ kind: "rect", id: "r", position: [0, 0], size: [300, 140], roundness: 70 }],
      fill: { color: hex("#ffd60a"), rule: "nonzero" },
    },
  },
  { id: "fire", name: "Fire", keywords: ["fire", "hot", "lit", "emoji"], text: "🔥" },
  { id: "heart", name: "Heart", keywords: ["heart", "love", "like", "emoji"], text: "❤️" },
  {
    id: "sparkles",
    name: "Sparkles",
    keywords: ["sparkle", "magic", "shine", "emoji"],
    text: "✨",
  },
  { id: "laugh", name: "Laughing", keywords: ["laugh", "lol", "funny", "emoji"], text: "😂" },
];

export const stickerById = (id: string): Sticker | undefined => STICKERS.find((s) => s.id === id);
