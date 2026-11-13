/** Copies of the channels played backwards. */
export function reverseChannels(channels: readonly Float32Array[]): Float32Array[] {
  return channels.map((ch) => {
    const out = new Float32Array(ch.length);
    for (let i = 0, j = ch.length - 1; i < ch.length; i += 1, j -= 1) out[i] = ch[j] ?? 0;
    return out;
  });
}
