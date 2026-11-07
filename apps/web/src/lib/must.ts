/** The value, or a clear error when it is missing: for tests and places where absence is a bug. */
export function must<T>(value: T | null | undefined, what = "value"): T {
  if (value === null || value === undefined) throw new Error(`Expected ${what} to exist`);
  return value;
}
