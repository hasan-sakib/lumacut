import { clipTimelineDurationUs, type Clip } from "@lumacut/schema";

/** `thumbs/index.json` written by the M1 worker: sprite sheets of evenly spaced frames. */
export interface ThumbIndex {
  intervalUs: number;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  rows: number;
  count: number;
}

export interface FilmstripTile {
  /** Left edge inside the clip, in pixels. */
  left: number;
  width: number;
  sheet: number;
  col: number;
  row: number;
  /** Rows actually present in this sheet (the last sheet may be short). */
  rowsInSheet: number;
}

/** The source time shown at `offsetUs` after the clip's start (reversed and frozen clips included). */
export function sourceTimeAt(clip: Clip, offsetUs: number): number {
  if (clip.freezeAtUs !== undefined) return clip.freezeAtUs;
  const moved = offsetUs * clip.speed;
  const t = clip.reversed ? clip.outUs - moved : clip.inUs + moved;
  return Math.min(clip.outUs - 1, Math.max(clip.inUs, Math.round(t)));
}

/**
 * The thumbnails to draw across a clip: one tile every `tileHeight`-aspect step, each showing
 * the frame at the middle of its span. `visible` (clip-local pixels) limits the work to what is on screen.
 */
export function filmstripTiles(
  clip: Clip,
  index: ThumbIndex,
  clipWidthPx: number,
  clipHeightPx: number,
  visible?: { fromPx: number; toPx: number },
): FilmstripTile[] {
  if (clipWidthPx <= 0 || clipHeightPx <= 0 || index.count <= 0 || index.tileHeight <= 0) return [];
  const tileWidth = Math.max(8, (clipHeightPx * index.tileWidth) / index.tileHeight);
  const lengthUs = clipTimelineDurationUs(clip);
  const perSheet = index.columns * index.rows;
  const first = visible === undefined ? 0 : Math.max(0, Math.floor(visible.fromPx / tileWidth));
  const last = Math.ceil((visible === undefined ? clipWidthPx : Math.min(clipWidthPx, visible.toPx)) / tileWidth);
  const tiles: FilmstripTile[] = [];
  for (let k = first; k < last; k += 1) {
    const left = k * tileWidth;
    const middle = Math.min(clipWidthPx, left + tileWidth / 2);
    const source = sourceTimeAt(clip, (middle / clipWidthPx) * lengthUs);
    const tile = Math.min(index.count - 1, Math.max(0, Math.floor(source / index.intervalUs)));
    const sheet = Math.floor(tile / perSheet);
    const within = tile % perSheet;
    tiles.push({
      left,
      width: tileWidth,
      sheet,
      col: within % index.columns,
      row: Math.floor(within / index.columns),
      rowsInSheet: Math.ceil(Math.min(index.count - sheet * perSheet, perSheet) / index.columns),
    });
  }
  return tiles;
}
