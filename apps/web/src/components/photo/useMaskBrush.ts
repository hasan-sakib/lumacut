import { applyToPoint } from "@lumacut/engine";
import type { Clip, Composition, Op, PaintStroke, Project, RasterMask } from "@lumacut/schema";
import { useCallback, useEffect, useRef } from "react";
import { createApiAssetResolver } from "../../engine/resolver.ts";
import type { ClipInfo } from "../../inspector/fields.ts";
import { layerSizeOf } from "../../inspector/masks.ts";
import { newId } from "../../lib/ids.ts";
import { uploadPicture } from "../../lib/mask-upload.ts";
import { toProjectAsset } from "../../lib/project-assets.ts";
import { MaskSession } from "../../photo/mask-session.ts";
import { canvasToLayer } from "../../photo/selection.ts";
import type { BrushSettings } from "../../photo/types.ts";
import { projectStore } from "../../stores/project.ts";
import { usePhotoStore } from "../../stores/photo.ts";

/** Quiet time after the last mask stroke before the picture is saved to the library. */
const SAVE_AFTER_MS = 2000;

export interface MaskBrushControls {
  /** One finished stroke, in canvas pixels (x, y, pressure triples). `hide` rubs the layer out. */
  addStroke: (points: number[], hide: boolean) => void;
  /** Saves what has been painted now (the tool was left, another layer was picked). */
  flush: () => Promise<void>;
}

interface Live {
  clipId: string;
  maskId: string;
  session: MaskSession;
  /** What the mask looks like apart from its picture (mode, opacity…). */
  base: Omit<RasterMask, "assetId">;
  dirty: boolean;
}

interface Inputs {
  project: Project | null;
  composition: Composition | undefined;
  /** The single selected layer the mask brush paints on. */
  target: ClipInfo | undefined;
  playheadUs: number;
  brush: BrushSettings;
  /** Shows the mask live in the preview (null clears it). */
  setOverride: (
    maskId: string,
    entry: { clipId: string; mask: RasterMask; bitmap: ImageBitmap } | null,
  ) => Promise<void>;
  onError: (message: string | null) => void;
}

async function loadPicture(assetId: string): Promise<ImageBitmap | null> {
  try {
    const url = await createApiAssetResolver().resolve(assetId, "image");
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) return null;
    return await createImageBitmap(await response.blob());
  } catch {
    return null;
  }
}

/**
 * Painting a layer's bitmap mask. Strokes go onto a local alpha picture that the preview shows at
 * once; a moment after the last stroke the picture is saved to the library as an image and the
 * mask (a new one, or the layer's existing bitmap mask) is pointed at it in one undo step.
 */
export function useMaskBrush(inputs: Inputs): MaskBrushControls {
  const latest = useRef(inputs);
  useEffect(() => {
    latest.current = inputs;
  });
  const live = useRef<Live | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const enqueue = useCallback((job: () => Promise<void>): Promise<void> => {
    const next = queue.current.then(job, job);
    queue.current = next.catch(() => undefined);
    return next;
  }, []);

  const save = useCallback(async (): Promise<void> => {
    const state = live.current;
    if (state?.dirty !== true) return;
    const { project, setOverride, onError } = latest.current;
    const photo = usePhotoStore.getState();
    photo.setMaskStatus({ state: "saving" });
    try {
      const png = await state.session.toPng();
      const asset = await uploadPicture(png, "Layer mask.png");
      const projectAsset = toProjectAsset(asset);
      if (projectAsset === null) throw new Error("The saved mask isn't ready to use.");
      const current = projectStore.getState().project ?? project;
      const clip = current?.compositions
        .flatMap((c) => c.tracks.flatMap((t) => t.clips))
        .find((c) => c.id === state.clipId);
      if (current === null || clip === undefined) {
        throw new Error("The layer was removed before the mask could be saved.");
      }
      const mask: RasterMask = { ...state.base, assetId: asset.id };
      const ops: Op[] = [];
      if (!current.assets.some((a) => a.id === asset.id)) {
        ops.push({ type: "addAsset", asset: projectAsset });
      }
      ops.push(
        clip.masks.some((m) => m.id === state.maskId)
          ? { type: "updateMask", clipId: clip.id, maskId: state.maskId, mask }
          : { type: "addMask", clipId: clip.id, mask },
      );
      const result = projectStore
        .getState()
        .dispatch({ type: "batch", label: "Paint mask", ops }, {});
      if (!result.ok) throw new Error(result.message);
      state.dirty = false;
      await setOverride(state.maskId, null);
      photo.setMaskStatus({ state: "idle" });
      onError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't save the mask.";
      photo.setMaskStatus({ state: "error", message });
      onError(message);
    }
  }, []);

  const flush = useCallback((): Promise<void> => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    return enqueue(save);
  }, [enqueue, save]);

  const begin = useCallback(
    async (clip: Clip, project: Project, comp: Composition): Promise<Live> => {
      const existing = clip.masks.find((m): m is RasterMask => m.kind === "raster");
      const size = layerSizeOf(clip, project, comp);
      const picture = existing === undefined ? null : await loadPicture(existing.assetId);
      const session = MaskSession.create(size.width, size.height, picture);
      picture?.close();
      return {
        clipId: clip.id,
        maskId: existing?.id ?? newId(),
        session,
        base: {
          kind: "raster",
          id: existing?.id ?? "",
          mode: existing?.mode ?? "add",
          feather: existing?.feather ?? 0,
          expansion: existing?.expansion ?? 0,
          opacity: existing?.opacity ?? 1,
          inverted: existing?.inverted ?? false,
        },
        dirty: false,
      };
    },
    [],
  );

  const addStroke = useCallback(
    (points: number[], hide: boolean): void => {
      void enqueue(async () => {
        const { project, composition, target, playheadUs, brush, setOverride, onError } =
          latest.current;
        if (project === null || composition === undefined || target === undefined) return;
        const clip = target.clip;
        if (target.track?.locked === true) {
          onError("That layer is locked.");
          return;
        }
        if (live.current !== null && live.current.clipId !== clip.id) await save();
        if (live.current?.clipId !== clip.id) {
          live.current = await begin(clip, project, composition);
          live.current.base = { ...live.current.base, id: live.current.maskId };
        }
        const state = live.current;
        const local = Math.max(0, playheadUs - clip.startUs);
        const inverse = canvasToLayer(clip, project, composition, local);
        const perCanvas = Math.hypot(inverse[0], inverse[1]);
        const mapped: number[] = [];
        for (let i = 0; i + 2 < points.length; i += 3) {
          const [x, y] = applyToPoint(inverse, [points[i] ?? 0, points[i + 1] ?? 0]);
          mapped.push(x, y, points[i + 2] ?? 1);
        }
        const stroke: PaintStroke = {
          id: newId(),
          tool: hide ? "eraser" : "brush",
          color: { r: 1, g: 1, b: 1, a: 1 },
          size: Math.max(0.5, brush.size * perCanvas),
          hardness: brush.hardness,
          opacity: brush.opacity,
          points: mapped,
        };
        state.session.paint(stroke);
        state.dirty = true;
        const bitmap = await state.session.snapshot();
        await setOverride(state.maskId, {
          clipId: state.clipId,
          mask: { ...state.base, id: state.maskId, assetId: "pending" },
          bitmap,
        });
        usePhotoStore.getState().setMaskStatus({ state: "dirty" });
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          void flush();
        }, SAVE_AFTER_MS);
      });
    },
    [begin, enqueue, flush, save],
  );

  // Leaving the page (or the tool) saves what is painted.
  useEffect(
    () => () => {
      void flush();
    },
    [flush],
  );

  return { addStroke, flush };
}
