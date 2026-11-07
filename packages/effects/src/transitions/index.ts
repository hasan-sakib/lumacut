import type { TransitionDefinition } from "../define.ts";
import { crossDissolveTransition } from "./crossDissolve/index.ts";
import { dipToBlackTransition } from "./dipToBlack/index.ts";
import { dipToWhiteTransition } from "./dipToWhite/index.ts";
import { wipeLinearTransition } from "./wipeLinear/index.ts";
import { wipeClockTransition } from "./wipeClock/index.ts";
import { wipeIrisTransition } from "./wipeIris/index.ts";
import { slideTransition } from "./slide/index.ts";
import { pushTransition } from "./push/index.ts";
import { zoomTransition } from "./zoom/index.ts";
import { spinTransition } from "./spin/index.ts";
import { blurDissolveTransition } from "./blurDissolve/index.ts";
import { glitchTransition } from "./glitch/index.ts";
import { lightFlashTransition } from "./lightFlash/index.ts";
import { whipPanTransition } from "./whipPan/index.ts";

/** Every transition, in the order the browser lists them. */
export const TRANSITIONS: readonly TransitionDefinition[] = [
  crossDissolveTransition,
  dipToBlackTransition,
  dipToWhiteTransition,
  wipeLinearTransition,
  wipeClockTransition,
  wipeIrisTransition,
  slideTransition,
  pushTransition,
  zoomTransition,
  spinTransition,
  blurDissolveTransition,
  glitchTransition,
  lightFlashTransition,
  whipPanTransition,
];
