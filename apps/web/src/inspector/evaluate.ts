export type EvalResult = { ok: true; value: number } | { ok: false; message: string };

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
/** Units people type after a number; they are display only and ignored. */
const UNIT = /\s*(?:%|°|deg|px|s|db|x|×)$/i;

function parse(text: string): number | null {
  const cleaned = text.trim().replace(UNIT, "").trim();
  if (!NUMBER.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * Reads what was typed into a numeric field, in the field's display units.
 * - `12`, `-5`, `.5`, `1e3`: that number (a leading minus is a negative number, not a subtraction)
 * - `+10`: add 10 to the current value; `*2`: double it; `/2`: halve it
 * - a trailing unit (`50%`, `45°`, `10px`, `2s`) is accepted and ignored
 */
export function evaluateInput(current: number, text: string): EvalResult {
  const input = text.trim();
  if (input === "") return { ok: false, message: "Type a number." };
  const operator = input[0];
  if (operator === "+" || operator === "*" || operator === "/") {
    const operand = parse(input.slice(1));
    if (operand === null) return { ok: false, message: `“${input}” isn't a number after ${operator}.` };
    if (operator === "/" && operand === 0) return { ok: false, message: "Can't divide by zero." };
    const value = operator === "+" ? current + operand : operator === "*" ? current * operand : current / operand;
    return Number.isFinite(value) ? { ok: true, value } : { ok: false, message: "That result is too large." };
  }
  const value = parse(input);
  return value === null ? { ok: false, message: `“${input}” isn't a number. Try 12, +10 or *2.` } : { ok: true, value };
}

/** Keeps a value inside the field's limits (either may be absent). */
export function clampTo(value: number, min?: number, max?: number): number {
  return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value));
}

/** Rounds away floating-point noise from scrubbing and arithmetic (to `places` decimals). */
export function tidy(value: number, places = 4): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}
