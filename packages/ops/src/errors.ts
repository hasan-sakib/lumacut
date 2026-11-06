/** Every way an op can be refused. Codes are stable: the UI and the AI branch on them. */
export const OP_ERROR_CODES = [
  "unknown_composition",
  "unknown_track",
  "unknown_clip",
  "unknown_asset",
  "unknown_marker",
  "unknown_effect",
  "unknown_mask",
  "unknown_keyframe",
  "duplicate_id",
  "track_locked",
  "wrong_track_kind",
  "clips_overlap",
  "invalid_range",
  "invalid_time",
  "invalid_speed",
  "trim_beyond_source",
  "not_adjacent",
  "split_out_of_range",
  "link_id_in_use",
  "asset_in_use",
  "composition_in_use",
  "composition_cycle",
  "keyframe_exists",
  "not_a_paint_clip",
  "invalid_op",
] as const;

export type OpErrorCode = (typeof OP_ERROR_CODES)[number];

export class OpError extends Error {
  override name = "OpError";
  readonly code: OpErrorCode;

  constructor(code: OpErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export function fail(code: OpErrorCode, message: string): never {
  throw new OpError(code, message);
}

/** A time or duration must be a non-negative safe integer (microseconds). */
export function assertTime(us: number, what: string): void {
  if (!Number.isSafeInteger(us) || us < 0) {
    fail("invalid_time", `${what} must be a non-negative whole number of microseconds, got ${String(us)}.`);
  }
}
