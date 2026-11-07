import type { Linter } from "eslint";

/**
 * Rule 6 (CLAUDE.md): rendering is deterministic. In the engine's render paths there is no wall
 * clock and no unseeded randomness; code that must measure time takes an injected `Clock`
 * (packages/engine/src/clock.ts, deliberately outside these folders).
 */
export const DETERMINISTIC_GLOBS = [
  "packages/engine/src/timeline/**/*.ts",
  "packages/engine/src/math/**/*.ts",
  "packages/engine/src/blend/**/*.ts",
  "packages/engine/src/gl/**/*.ts",
  "packages/engine/src/decode/**/*.ts",
  "packages/engine/src/render/**/*.ts",
  "packages/engine/src/color/**/*.ts",
  "packages/effects/src/**/*.ts",
];

const WHY = "Render code must be deterministic (CLAUDE.md rule 6). Inject a Clock or a seeded RNG.";

export const determinismRules: Linter.RulesRecord = {
  "no-restricted-properties": [
    "error",
    { object: "Date", property: "now", message: WHY },
    { object: "Math", property: "random", message: WHY },
    { object: "performance", property: "now", message: WHY },
    { object: "crypto", property: "randomUUID", message: WHY },
    { object: "crypto", property: "getRandomValues", message: WHY },
  ],
  // Keeps the repo-wide "named exports only" rule and adds `new Date()` (the current time).
  "no-restricted-syntax": [
    "error",
    { selector: "ExportDefaultDeclaration", message: "Use named exports (CLAUDE.md)." },
    { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: WHY },
    { selector: "CallExpression[callee.name='Date']", message: WHY },
  ],
};
