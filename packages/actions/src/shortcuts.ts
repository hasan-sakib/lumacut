/**
 * Keyboard shortcuts as canonical strings: modifiers in the order Mod, Alt, Shift, then the key.
 * `Mod` is Cmd on macOS and Ctrl elsewhere. Examples: "Mod+U", "Shift+Delete", "/".
 */

const MODIFIERS = ["Mod", "Alt", "Shift"] as const;
type Modifier = (typeof MODIFIERS)[number];

const KEY_ALIASES: Record<string, string> = {
  del: "Delete",
  delete: "Delete",
  backspace: "Backspace",
  esc: "Escape",
  escape: "Escape",
  enter: "Enter",
  return: "Enter",
  space: "Space",
  " ": "Space",
  tab: "Tab",
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
};

function canonicalKey(key: string): string {
  const alias = KEY_ALIASES[key.toLowerCase()];
  if (alias !== undefined) return alias;
  if (key.length === 1) return key.toUpperCase();
  if (/^arrow(up|down|left|right)$/i.test(key))
    return `Arrow${key.slice(5, 6).toUpperCase()}${key.slice(6).toLowerCase()}`;
  if (/^f\d{1,2}$/i.test(key)) return key.toUpperCase();
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** Parses "mod+shift+u" / "Ctrl+U" style text into canonical form; throws on bad input. */
export function normalizeShortcut(text: string): string {
  const parts = text.split("+").map((p) => p.trim());
  const key = parts.pop();
  if (key === undefined || key === "") throw new Error(`Shortcut "${text}" has no key`);
  const mods = new Set<Modifier>();
  for (const raw of parts) {
    const lower = raw.toLowerCase();
    const mod: Modifier | undefined =
      lower === "mod" || lower === "cmd" || lower === "ctrl" || lower === "meta"
        ? "Mod"
        : lower === "alt" || lower === "option"
          ? "Alt"
          : lower === "shift"
            ? "Shift"
            : undefined;
    if (mod === undefined) throw new Error(`Unknown modifier "${raw}" in shortcut "${text}"`);
    mods.add(mod);
  }
  return [...MODIFIERS.filter((m) => mods.has(m)), canonicalKey(key)].join("+");
}

export interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** Canonical shortcut for a keyboard event, or null for a lone modifier key. */
export function shortcutFromEvent(event: KeyEventLike, isMac: boolean): string | null {
  if (["Control", "Meta", "Alt", "Shift"].includes(event.key)) return null;
  const mods: string[] = [];
  if (isMac ? event.metaKey : event.ctrlKey) mods.push("Mod");
  if (event.altKey) mods.push("Alt");
  // Shift is part of printable characters like "?" or "/"; only count it for named keys/letters.
  const printable = event.key.length === 1 && !/[a-z]/i.test(event.key);
  if (event.shiftKey && !printable) mods.push("Shift");
  return [...mods, canonicalKey(event.key)].join("+");
}

const MAC_SYMBOLS: Record<string, string> = { Mod: "⌘", Alt: "⌥", Shift: "⇧" };
const KEY_LABELS: Record<string, string> = {
  Delete: "Del",
  Backspace: "⌫",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Escape: "Esc",
};

/** Human label: "⌘U" on macOS, "Ctrl+U" elsewhere. */
export function formatShortcut(shortcut: string, isMac: boolean): string {
  const parts = shortcut.split("+");
  const key = parts.pop() ?? "";
  const label = KEY_LABELS[key] ?? key;
  if (isMac) return parts.map((m) => MAC_SYMBOLS[m] ?? m).join("") + label;
  return [...parts.map((m) => (m === "Mod" ? "Ctrl" : m)), label].join("+");
}
