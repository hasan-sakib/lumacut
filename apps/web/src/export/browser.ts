import {
  VideoExportClient,
  loudnessTarget,
  normalizeLoudness,
  renderMix,
  type ExportSettings,
  type VideoExportResult,
} from "@lumacut/engine";
import type { Project } from "@lumacut/schema";
import { createApiAssetResolver } from "../engine/resolver.ts";

export interface BrowserExportHandle {
  /** Resolves with the file (or rejects with a message, including "cancelled"). */
  done: Promise<{ blob: Blob; result: Omit<VideoExportResult, "data"> }>;
  cancel: () => void;
}

/**
 * Exports MP4 / WebM in this browser: the sound is mixed offline here (from the original files,
 * loudness-normalised if asked), then a worker of its own draws and encodes the picture with
 * WebCodecs. `onProgress` reports the phase and frames done.
 */
export function exportInBrowser(
  project: Project,
  compositionId: string,
  settings: ExportSettings,
  onProgress: (phase: "sound" | "picture", done: number, total: number) => void,
): BrowserExportHandle {
  const resolver = createApiAssetResolver();
  const client = new VideoExportClient(resolver);
  // An object, not a `let`: the flag is flipped from `cancel`, which flow analysis can't see.
  const state = { cancelled: false };
  const done = (async () => {
    try {
      onProgress("sound", 0, 1);
      const mix = await renderMix(project, resolver, {
        compositionId,
        fromUs: settings.fromUs,
        toUs: settings.toUs,
        media: "original",
      });
      if (state.cancelled) throw new Error("The export was cancelled.");
      const target = loudnessTarget(settings.loudness);
      const channels =
        target === null
          ? mix.channels
          : normalizeLoudness(mix.channels, mix.sampleRate, target).channels;
      // A silent composition gets no sound track at all.
      const audible = channels.some((ch) => ch.some((v) => v !== 0));
      onProgress("sound", 1, 1);
      const result = await client.run(
        {
          project,
          compositionId,
          settings,
          audio: audible ? { channels, sampleRate: mix.sampleRate } : null,
          fontBaseUrl: new URL("/fonts/", location.href).href,
        },
        (frames, total) => {
          onProgress("picture", frames, total);
        },
      );
      const { data, ...rest } = result;
      return { blob: new Blob([data], { type: result.mimeType }), result: rest };
    } finally {
      client.dispose();
    }
  })();
  return {
    done,
    cancel: () => {
      state.cancelled = true;
      client.cancel();
    },
  };
}
