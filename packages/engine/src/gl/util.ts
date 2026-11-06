import { GlUnavailableError } from "./context.ts";

/** `gl.create*()` returns null when the GPU can't allocate (typically out of memory). */
export function required<T>(value: T | null, what: string): T {
  if (value === null) {
    throw new GlUnavailableError(`The GPU couldn't create a ${what} (out of graphics memory?)`);
  }
  return value;
}
