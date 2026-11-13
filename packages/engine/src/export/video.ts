import {
  AudioSample,
  AudioSampleSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
  canEncodeAudio,
  canEncodeVideo,
} from "mediabunny";
import type { Project } from "@lumacut/schema";
import type { MediaResolver } from "../decode/media.ts";
import type { Diagnostic } from "../render/diagnostics.ts";
import { Engine } from "../render/engine.ts";
import {
  audioBitrate,
  framePlan,
  outputSize,
  videoBitrate,
  type ExportSettings,
} from "./settings.ts";

export interface VideoExportJob {
  project: Project;
  compositionId: string;
  settings: ExportSettings;
  /** The mixed (and loudness-normalised) sound of the range, planar, or null for none. */
  audio: { channels: Float32Array[]; sampleRate: number } | null;
  fontBaseUrl?: string;
}

export interface VideoExportResult {
  data: ArrayBuffer;
  mimeType: string;
  width: number;
  height: number;
  frames: number;
  /** Things that didn't come out as designed (an original read from its proxy, a missing font…), deduplicated. */
  diagnostics: Diagnostic[];
}

/**
 * Encodes a composition to MP4 (H.264 + AAC) or WebM (VP9 + Opus) with WebCodecs, through
 * Mediabunny: an engine of its own draws every output frame (reading original files) on an
 * `OffscreenCanvas` at the output size, the canvas is captured and encoded, and the mix is
 * encoded alongside. Video frame `i` is composition time `from + i/fps` and the sound starts at
 * the same instant, so picture and sound are in sync by construction. Runs in a worker or a page.
 */
export async function exportVideo(
  job: VideoExportJob,
  resolver: MediaResolver,
  onProgress: (done: number, total: number) => void,
  cancelled: () => boolean,
): Promise<VideoExportResult> {
  const { project, settings } = job;
  if (settings.format !== "mp4" && settings.format !== "webm") {
    throw new Error(`${settings.format.toUpperCase()} is made on the server.`);
  }
  const composition = project.compositions.find((c) => c.id === job.compositionId);
  if (composition === undefined) throw new Error("That composition doesn't exist.");
  const size = outputSize(composition, settings);
  const plan = framePlan(settings.fromUs, settings.toUs, settings.fps);
  const mp4 = settings.format === "mp4";
  const videoCodec = mp4 ? "avc" : "vp9";
  const audioCodec = mp4 ? "aac" : "opus";
  const bitrate = videoBitrate(size, settings.fps, settings);
  if (!(await canEncodeVideo(videoCodec, { width: size.width, height: size.height, bitrate }))) {
    throw new Error(
      `This browser can't encode ${mp4 ? "H.264" : "VP9"} video at ${String(size.width)}×${String(size.height)}. Try the server export.`,
    );
  }
  const audio = job.audio;
  if (
    audio !== null &&
    !(await canEncodeAudio(audioCodec, {
      numberOfChannels: audio.channels.length,
      sampleRate: audio.sampleRate,
      bitrate: audioBitrate(settings.quality),
    }))
  ) {
    throw new Error(
      `This browser can't encode ${mp4 ? "AAC" : "Opus"} sound. Try the server export.`,
    );
  }

  const canvas = new OffscreenCanvas(size.width, size.height);
  const engine = Engine.create({
    canvas,
    resolver,
    media: "original",
    ...(job.fontBaseUrl === undefined ? {} : { fontBaseUrl: job.fontBaseUrl }),
  });
  const output = new Output({
    format: mp4 ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const diagnostics = new Map<string, Diagnostic>();
  try {
    engine.setProject(project);
    const scale = size.width / composition.width;
    // The window is sized so the canvas is exactly the (even) output size.
    engine.setView({ x: 0, y: 0, width: size.width / scale, height: size.height / scale, scale });
    const video = new CanvasSource(canvas, {
      codec: videoCodec,
      quality: new Quality({ bitrate }),
      keyFrameInterval: 2,
    });
    output.addVideoTrack(video, { frameRate: settings.fps });
    let sound: AudioSampleSource | null = null;
    if (audio !== null) {
      sound = new AudioSampleSource({
        codec: audioCodec,
        quality: new Quality({ bitrate: audioBitrate(settings.quality) }),
      });
      output.addAudioTrack(sound);
    }
    await output.start();

    if (sound !== null && audio !== null) {
      // One-second pieces of the mix, planar float.
      const total = audio.channels[0]?.length ?? 0;
      const step = audio.sampleRate;
      for (let at = 0; at < total; at += step) {
        const n = Math.min(step, total - at);
        const planar = new Float32Array(n * audio.channels.length);
        audio.channels.forEach((ch, c) => {
          planar.set(ch.subarray(at, at + n), c * n);
        });
        const sample = new AudioSample({
          data: planar,
          format: "f32-planar",
          numberOfChannels: audio.channels.length,
          sampleRate: audio.sampleRate,
          timestamp: at / audio.sampleRate,
        });
        await sound.add(sample);
        sample.close();
      }
      sound.close();
    }

    for (let i = 0; i < plan.count; i += 1) {
      if (cancelled()) throw new Error("The export was cancelled.");
      const result = await engine.renderAt(job.compositionId, plan.timeOf(i));
      for (const d of result.diagnostics) {
        if (d.level === "error" && d.code === "render_error") throw new Error(d.message);
        diagnostics.set(`${d.clipId ?? "-"}:${d.code}`, d);
      }
      await video.add(plan.timestampOf(i), 1 / plan.fps);
      onProgress(i + 1, plan.count);
    }
    video.close();
    await output.finalize();
    const data = output.target.buffer;
    if (data === null) throw new Error("The encoder produced no file.");
    return {
      data,
      mimeType: mp4 ? "video/mp4" : "video/webm",
      width: size.width,
      height: size.height,
      frames: plan.count,
      diagnostics: [...diagnostics.values()],
    };
  } catch (error) {
    await output.cancel().catch(() => undefined);
    throw error;
  } finally {
    await engine.dispose();
  }
}
