/** Fixed dimensions of the timeline, in CSS pixels. */
export const HEADER_WIDTH = 168;
export const RULER_HEIGHT = 30;
export const LANE_HEIGHT = 56;
/** Width of the grab zone at each end of a clip, for trimming. */
export const HANDLE_WIDTH = 7;
/** How far the pointer must travel before a press counts as a drag rather than a click. */
export const DRAG_THRESHOLD_PX = 3;
/** Snap distance in pixels (converted to µs at the current zoom). */
export const SNAP_PX = 8;
/** Empty space kept after the last clip so there is room to drop things. */
export const TAIL_US = 10_000_000;
