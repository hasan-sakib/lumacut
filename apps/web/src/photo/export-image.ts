import { EngineClient } from "@lumacut/engine";
import { planTiles, unpremultiply } from "@lumacut/engine/export";
import type { Project } from "@lumacut/schema";
import { createApiAssetResolver } from "../engine/resolver.ts";
import type { ImageExportRequest } from "./types.ts";

/** The most pixels the engine draws on a side at once, and the margin each tile gets (canvas pixels). */
const TILE_SIDE = 2048;
const TILE_MARGIN = 48;
/** Largest picture the browser can be expected to make (a 2D canvas side). */
const MAX_OUTPUT_SIDE = 16384;

const MIME = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" } as const;
export const EXTENSION = { png: "png", jpeg: "jpg", webp: "webp" } as const;

const css = (c: { r: number; g: number; b: number; a: number }): string =>
  `rgba(${String(Math.round(c.r * 255))},${String(Math.round(c.g * 255))},${String(Math.round(c.b * 255))},${String(c.a)})`;

/**
 * Draws a composition at full resolution and encodes it as PNG, JPEG or WebP. The engine draws
 * the picture in tiles (so a big photo never needs one huge GPU target) on its own worker, apart
 * from the live preview; the tiles are stitched on a 2D canvas, flattened onto a background colour
 * when asked (always for JPEG), and encoded.
 */
export async function renderProjectImage(
  project: Project,
  request: ImageExportRequest,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const composition = project.compositions.find((c) => c.id === request.compositionId);
  if (composition === undefined) throw new Error("That composition doesn't exist.");
  const outW = Math.max(1, Math.round(composition.width * request.scale));
  const outH = Math.max(1, Math.round(composition.height * request.scale));
  if (Math.max(outW, outH) > MAX_OUTPUT_SIDE) {
    throw new Error(
      `${String(outW)} × ${String(outH)} px is larger than a browser can make (${String(MAX_OUTPUT_SIDE)} px on a side). Lower the size.`,
    );
  }
  const stitched = new OffscreenCanvas(outW, outH);
  const ctx = stitched.getContext("2d");
  if (ctx === null) throw new Error("This browser can't make the picture (no 2D canvas).");

  const client = await EngineClient.create({
    canvas: new OffscreenCanvas(1, 1),
    resolver: createApiAssetResolver(),
  });
  try {
    await client.setProject(project);
    const tiles = planTiles(
      composition.width,
      composition.height,
      request.scale,
      TILE_SIDE,
      TILE_MARGIN,
    );
    let done = 0;
    for (const tile of tiles) {
      const result = await client.renderAt(request.compositionId, request.tUs, {
        readback: true,
        view: { ...tile.window, scale: request.scale },
      });
      const failed = result.diagnostics.find((d) => d.level === "error");
      if (failed !== undefined) throw new Error(failed.message);
      unpremultiply(result.pixels);
      const data = new Uint8ClampedArray(result.pixels.length);
      data.set(result.pixels);
      const image = new ImageData(data, result.width, result.height);
      ctx.putImageData(
        image,
        tile.out.x,
        tile.out.y,
        tile.inside.x,
        tile.inside.y,
        tile.out.width,
        tile.out.height,
      );
      done += 1;
      onProgress?.(done, tiles.length);
    }
  } finally {
    await client.dispose();
  }

  // JPEG has no transparency: lay the picture on a colour. PNG and WebP keep it unless asked.
  const background = request.background ?? (request.format === "jpeg" ? WHITE : null);
  let final = stitched;
  if (background !== null) {
    final = new OffscreenCanvas(outW, outH);
    const fctx = final.getContext("2d");
    if (fctx === null) throw new Error("This browser can't make the picture (no 2D canvas).");
    fctx.fillStyle = css(background);
    fctx.fillRect(0, 0, outW, outH);
    fctx.drawImage(stitched, 0, 0);
  }
  return final.convertToBlob({
    type: MIME[request.format],
    ...(request.format === "png" ? {} : { quality: Math.min(1, Math.max(0.01, request.quality)) }),
  });
}

const WHITE = { r: 1, g: 1, b: 1, a: 1 };

/** Hands a picture to the browser's download. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
}
