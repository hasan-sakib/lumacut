/**
 * A WAV file (RIFF, PCM) from planar float samples in −1..1. 16- or 24-bit integers, interleaved;
 * values are clipped and rounded (no dither, so the same mix always gives the same file).
 */
export function encodeWav(
  channels: readonly Float32Array[],
  sampleRate: number,
  bits: 16 | 24 = 24,
): ArrayBuffer {
  const count = Math.max(1, channels.length);
  const frames = channels[0]?.length ?? 0;
  const bytesPerSample = bits / 8;
  const dataBytes = frames * count * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * bytesPerSample, true);
  view.setUint16(32, count * bytesPerSample, true);
  view.setUint16(34, bits, true);
  text(36, "data");
  view.setUint32(40, dataBytes, true);
  const max = bits === 16 ? 32767 : 8388607;
  let offset = 44;
  for (let i = 0; i < frames; i += 1) {
    for (let c = 0; c < count; c += 1) {
      const v = Math.max(-1, Math.min(1, channels[c]?.[i] ?? channels[0]?.[i] ?? 0));
      const int = Math.round(v * max);
      if (bits === 16) {
        view.setInt16(offset, int, true);
      } else {
        view.setUint8(offset, int & 0xff);
        view.setUint8(offset + 1, (int >> 8) & 0xff);
        view.setUint8(offset + 2, (int >> 16) & 0xff);
      }
      offset += bytesPerSample;
    }
  }
  return buffer;
}
