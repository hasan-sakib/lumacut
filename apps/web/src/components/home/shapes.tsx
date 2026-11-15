/** The video shapes offered when starting a new project. */
export const SHAPES = [
  { aspect: "9:16", label: "Reel / Short", hint: "1080 × 1920", use: "TikTok, Reels, Shorts" },
  { aspect: "16:9", label: "Widescreen", hint: "1920 × 1080", use: "YouTube, presentations" },
  { aspect: "1:1", label: "Square", hint: "1080 × 1080", use: "Feed posts" },
  { aspect: "4:5", label: "Portrait post", hint: "1080 × 1350", use: "Instagram, Facebook" },
] as const;

export type ShapeAspect = (typeof SHAPES)[number]["aspect"];

/** A small outline drawn in the shape's real proportions. */
export function ShapeGlyph({ aspect, size = 40 }: { aspect: string; size?: number }) {
  const [w = 16, h = 9] = aspect.split(":").map(Number);
  const width = w >= h ? size : (size * w) / h;
  const height = w >= h ? (size * h) / w : size;
  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <span
        className="rounded-[5px] border-2 border-current bg-current/10"
        style={{ width, height }}
      />
    </span>
  );
}
