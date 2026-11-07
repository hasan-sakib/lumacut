import {
  histogram,
  parade,
  vectorscope,
  vectorscopeTarget,
  waveform,
  type Waveform,
  type ScopeSample,
} from "@lumacut/engine/scopes";

export type ScopeKind = "waveform" | "parade" | "vectorscope" | "histogram";

export const SCOPE_INFO: Record<ScopeKind, { label: string; description: string }> = {
  waveform: {
    label: "Waveform",
    description: "Brightness of every column of the picture, from black (bottom) to white (top).",
  },
  parade: {
    label: "RGB parade",
    description: "Red, green and blue waveforms side by side, to spot colour casts.",
  },
  vectorscope: {
    label: "Vectorscope",
    description: "Where the colours sit: distance from the centre is saturation, angle is hue.",
  },
  histogram: {
    label: "Histogram",
    description: "How many pixels there are at each brightness, per channel.",
  },
};

export const SCOPE_W = 256;
export const SCOPE_H = 160;

/** Brightness for a count: a square root keeps rare values visible next to a dense one. */
const level = (count: number, max: number): number =>
  count === 0 || max === 0 ? 0 : Math.min(1, 0.12 + 0.88 * Math.sqrt(count / max));

function paintWaveform(
  image: ImageData,
  wave: Waveform,
  x0: number,
  width: number,
  color: readonly [number, number, number],
): void {
  // A pixel row/column may cover several waveform rows/columns (or one covers several pixels):
  // take the largest count in the covered cells so thin lines never vanish when scaled down.
  for (let y = 0; y < image.height; y++) {
    const row0 = Math.floor((y * wave.height) / image.height);
    const row1 = Math.max(row0 + 1, Math.floor(((y + 1) * wave.height) / image.height));
    for (let x = 0; x < width; x++) {
      const col0 = Math.floor((x * wave.width) / width);
      const col1 = Math.max(col0 + 1, Math.floor(((x + 1) * wave.width) / width));
      let count = 0;
      for (let r = row0; r < Math.min(row1, wave.height); r++) {
        for (let c = col0; c < Math.min(col1, wave.width); c++) {
          count = Math.max(count, wave.counts[r * wave.width + c] ?? 0);
        }
      }
      const v = level(count, wave.max);
      if (v === 0) continue;
      const at = (y * image.width + x0 + x) * 4;
      image.data[at] = Math.min(255, (image.data[at] ?? 0) + color[0] * v);
      image.data[at + 1] = Math.min(255, (image.data[at + 1] ?? 0) + color[1] * v);
      image.data[at + 2] = Math.min(255, (image.data[at + 2] ?? 0) + color[2] * v);
      image.data[at + 3] = 255;
    }
  }
}

/** Draws a scope of `sample` onto a SCOPE_W × SCOPE_H canvas context. */
export function drawScope(
  ctx: CanvasRenderingContext2D,
  kind: ScopeKind,
  sample: ScopeSample,
): void {
  const image = ctx.createImageData(SCOPE_W, SCOPE_H);
  for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255; // opaque black
  if (kind === "waveform") {
    paintWaveform(image, waveform(sample, "luma", SCOPE_W), 0, SCOPE_W, [120, 255, 120]);
  } else if (kind === "parade") {
    const p = parade(sample, SCOPE_W);
    const third = Math.floor(SCOPE_W / 3);
    paintWaveform(image, p.r, 0, third, [255, 70, 70]);
    paintWaveform(image, p.g, third, third, [70, 255, 70]);
    paintWaveform(image, p.b, third * 2, third, [90, 130, 255]);
  } else if (kind === "histogram") {
    const h = histogram(sample);
    const channels: [Uint32Array, readonly [number, number, number]][] = [
      [h.r, [255, 70, 70]],
      [h.g, [70, 255, 70]],
      [h.b, [90, 130, 255]],
    ];
    for (const [bins, color] of channels) {
      for (let x = 0; x < SCOPE_W; x++) {
        const count = bins[Math.floor((x * 256) / SCOPE_W)] ?? 0;
        const height = Math.round(level(count, h.max) * (SCOPE_H - 1));
        for (let y = SCOPE_H - height; y < SCOPE_H; y++) {
          const at = (y * SCOPE_W + x) * 4;
          image.data[at] = Math.min(255, (image.data[at] ?? 0) + color[0] * 0.6);
          image.data[at + 1] = Math.min(255, (image.data[at + 1] ?? 0) + color[1] * 0.6);
          image.data[at + 2] = Math.min(255, (image.data[at + 2] ?? 0) + color[2] * 0.6);
        }
      }
    }
  } else {
    // Vectorscope: a square plot centred in the canvas.
    const scope = vectorscope(sample);
    const size = SCOPE_H;
    const left = Math.floor((SCOPE_W - size) / 2);
    for (let row = 0; row < scope.size; row++) {
      for (let col = 0; col < scope.size; col++) {
        const v = level(scope.counts[row * scope.size + col] ?? 0, scope.max);
        if (v === 0) continue;
        const x = left + Math.floor((col * size) / scope.size);
        const y = Math.floor((row * size) / scope.size);
        const at = (y * SCOPE_W + x) * 4;
        image.data[at] = Math.min(255, (image.data[at] ?? 0) + 140 * v);
        image.data[at + 1] = Math.min(255, (image.data[at + 1] ?? 0) + 255 * v);
        image.data[at + 2] = Math.min(255, (image.data[at + 2] ?? 0) + 140 * v);
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  drawGraticule(ctx, kind);
}

const TARGETS: [string, number, number, number][] = [
  ["R", 255, 0, 0],
  ["Y", 255, 255, 0],
  ["G", 0, 255, 0],
  ["C", 0, 255, 255],
  ["B", 0, 0, 255],
  ["M", 255, 0, 255],
];

function drawGraticule(ctx: CanvasRenderingContext2D, kind: ScopeKind): void {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "9px sans-serif";
  ctx.lineWidth = 1;
  if (kind === "vectorscope") {
    const size = SCOPE_H;
    const left = Math.floor((SCOPE_W - size) / 2);
    ctx.beginPath();
    ctx.arc(left + size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.moveTo(left, size / 2);
    ctx.lineTo(left + size, size / 2);
    ctx.moveTo(left + size / 2, 0);
    ctx.lineTo(left + size / 2, size);
    ctx.stroke();
    for (const [label, r, g, b] of TARGETS) {
      const t = vectorscopeTarget(r, g, b);
      ctx.fillText(label, left + t.x * size - 3, t.y * size + 3);
    }
  } else if (kind === "histogram") {
    ctx.beginPath();
    for (const f of [0.25, 0.5, 0.75]) {
      ctx.moveTo(SCOPE_W * f, 0);
      ctx.lineTo(SCOPE_W * f, SCOPE_H);
    }
    ctx.stroke();
  } else {
    ctx.beginPath();
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      const y = Math.min(SCOPE_H - 0.5, f * SCOPE_H);
      ctx.moveTo(0, y);
      ctx.lineTo(SCOPE_W, y);
    }
    ctx.stroke();
    for (const [f, label] of [
      [0, "255"],
      [0.5, "128"],
      [1, "0"],
    ] as const) {
      ctx.fillText(label, 2, Math.min(SCOPE_H - 2, f * SCOPE_H + 9));
    }
  }
  ctx.restore();
}
