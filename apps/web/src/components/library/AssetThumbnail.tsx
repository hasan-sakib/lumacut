import { useState, type ReactElement } from "react";
import type { AssetOut } from "../../api/client.ts";
import { Icon } from "../Icon.tsx";
import { useInView, useRemoteJson } from "./useRemoteJson.ts";
import { Waveform, type WaveformData } from "./Waveform.tsx";

interface ThumbIndex {
  intervalUs: number;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  rows: number;
  count: number;
}

/**
 * Poster for videos (hover to scrub through the sprite sheets), thumbnail for images, waveform
 * for audio. Storage is cross-origin and the app is cross-origin isolated (COEP), so every image
 * is an <img crossOrigin="anonymous"> (CORS), never a CSS background.
 */
export function AssetThumbnail({ asset }: { asset: AssetOut }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [scrub, setScrub] = useState<number | null>(null);
  const urls = asset.urls;
  const index = useRemoteJson(urls.thumbIndex, inView && scrub !== null) as ThumbIndex | null;
  const waveform = useRemoteJson(
    urls.waveform,
    inView && asset.kind !== "image",
  ) as WaveformData | null;

  let sprite: ReactElement | null = null;
  if (index && scrub !== null) {
    const tile = Math.min(index.count - 1, Math.floor(scrub * index.count));
    const perSheet = index.columns * index.rows;
    const sheet = Math.floor(tile / perSheet);
    const within = tile % perSheet;
    const rowsInSheet = Math.ceil(
      Math.min(index.count - sheet * perSheet, perSheet) / index.columns,
    );
    const col = within % index.columns;
    const row = Math.floor(within / index.columns);
    const src = urls.thumbSheets?.[sheet];
    if (src) {
      // Fit the tile inside the 16:9 card at its own aspect (pillarbox portrait, letterbox wide).
      const narrow = index.tileWidth / index.tileHeight < 16 / 9;
      sprite = (
        <div
          className="relative overflow-hidden"
          style={{
            aspectRatio: `${String(index.tileWidth)} / ${String(index.tileHeight)}`,
            height: narrow ? "100%" : "auto",
            width: narrow ? "auto" : "100%",
          }}
        >
          <img
            src={src}
            crossOrigin="anonymous"
            alt=""
            data-testid="sprite"
            className="absolute left-0 top-0 max-w-none"
            style={{
              width: `${String(index.columns * 100)}%`,
              transform: `translate(${String((-col / index.columns) * 100)}%, ${String((-row / rowsInSheet) * 100)}%)`,
            }}
          />
        </div>
      );
    }
  }

  const still = asset.kind === "image" ? urls.thumb : urls.poster;
  return (
    <div
      ref={ref}
      className="relative aspect-video overflow-hidden rounded-t-lg bg-neutral-900"
      onMouseMove={(e) => {
        if (asset.kind !== "video") return;
        const box = e.currentTarget.getBoundingClientRect();
        setScrub(Math.min(0.999, Math.max(0, (e.clientX - box.left) / box.width)));
      }}
      onMouseLeave={() => {
        setScrub(null);
      }}
    >
      {still ? (
        <img
          src={still}
          crossOrigin="anonymous"
          alt=""
          data-testid="poster"
          className="h-full w-full object-contain"
        />
      ) : asset.kind === "audio" && waveform ? (
        <Waveform waveform={waveform} className="h-full w-full p-4" />
      ) : (
        <div className="flex h-full items-center justify-center text-neutral-600">
          <Icon name={asset.kind ?? "file"} className="h-10 w-10" />
        </div>
      )}
      {sprite && (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
          {sprite}
        </div>
      )}
      {asset.kind === "video" && waveform && (
        <Waveform
          waveform={waveform}
          bars={64}
          className="absolute bottom-0 left-0 h-6 w-full bg-black/40"
        />
      )}
    </div>
  );
}
