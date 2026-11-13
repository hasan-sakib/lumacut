import {
  Engine,
  encodeWav,
  framePlan,
  loudnessTarget,
  normalizeLoudness,
  outputSize,
  renderMix,
  type ExportSettings,
  type MediaKind,
  type MediaResolver,
} from "@lumacut/engine";
import type { Project } from "@lumacut/schema";

/** What the server export job asks the page to do (see services/worker/lumacut_worker/export). */
export interface ServerExportJob {
  project: Project;
  compositionId: string;
  settings: ExportSettings;
  /** Base URL of the job's local server: media at `/media/<assetId>/<kind>`, results POSTed back. */
  endpoint: string;
}

export interface ServerExportReport {
  width: number;
  height: number;
  frames: number;
  hasAudio: boolean;
  /** Diagnostics seen while drawing (deduplicated `code: message`). */
  warnings: string[];
}

const post = async (url: string, body: BodyInit): Promise<void> => {
  const response = await fetch(url, { method: "POST", body });
  if (!response.ok) throw new Error(`The export job refused a piece (${String(response.status)}).`);
};

/**
 * Draws the export with the same engine as the editor and hands it to the job piece by piece:
 * every video frame as raw RGBA (top-down, premultiplied: transparent areas come out over black),
 * then the mix as a WAV. The job feeds them to FFmpeg. Media is read through the job's server
 * (same origin), originals first.
 */
export async function runServerExport(job: ServerExportJob): Promise<ServerExportReport> {
  const { project, settings, endpoint } = job;
  const composition = project.compositions.find((c) => c.id === job.compositionId);
  if (composition === undefined) throw new Error("That composition doesn't exist.");
  const resolver: MediaResolver = {
    resolve: (assetId: string, kind: MediaKind) =>
      Promise.resolve(`${endpoint}/media/${encodeURIComponent(assetId)}/${kind}`),
  };
  const warnings = new Set<string>();
  let width = 0;
  let height = 0;
  let frames = 0;

  if (settings.format !== "mp3") {
    const size = outputSize(composition, settings);
    width = size.width;
    height = size.height;
    const fps = settings.format === "gif" ? Math.min(settings.fps, 25) : settings.fps;
    const plan = framePlan(settings.fromUs, settings.toUs, fps);
    frames = plan.count;
    const engine = Engine.create({
      canvas: new OffscreenCanvas(width, height),
      resolver,
      media: "original",
      fontBaseUrl: new URL("/fonts/", location.href).href,
    });
    try {
      engine.setProject(project);
      const scale = width / composition.width;
      engine.setView({ x: 0, y: 0, width: width / scale, height: height / scale, scale });
      for (let i = 0; i < plan.count; i += 1) {
        const result = await engine.renderAt(job.compositionId, plan.timeOf(i), { readback: true });
        for (const d of result.diagnostics) {
          if (d.level === "error" && d.code === "render_error") throw new Error(d.message);
          warnings.add(`${d.code}: ${d.message}`);
        }
        await post(`${endpoint}/frame?i=${String(i)}`, result.pixels.slice().buffer);
      }
    } finally {
      await engine.dispose();
    }
  }

  let hasAudio = false;
  if (settings.format !== "gif") {
    const mix = await renderMix(project, resolver, {
      compositionId: job.compositionId,
      fromUs: settings.fromUs,
      toUs: settings.toUs,
      media: "original",
    });
    let channels = mix.channels;
    const target = loudnessTarget(settings.loudness);
    if (target !== null) channels = normalizeLoudness(channels, mix.sampleRate, target).channels;
    for (const d of mix.diagnostics) warnings.add(`${d.code}: ${d.message}`);
    await post(`${endpoint}/audio`, encodeWav(channels, mix.sampleRate, 24));
    hasAudio = true;
  }
  return { width, height, frames, hasAudio, warnings: [...warnings] };
}
