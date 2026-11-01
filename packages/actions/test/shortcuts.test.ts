import { describe, expect, it } from "vitest";
import { formatShortcut, normalizeShortcut, shortcutFromEvent } from "../src/index.ts";

const KEY = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };

describe("shortcuts", () => {
  it.each([
    ["mod+u", "Mod+U"],
    ["Ctrl+Shift+z", "Mod+Shift+Z"],
    ["shift+alt+cmd+k", "Mod+Alt+Shift+K"],
    ["del", "Delete"],
    ["/", "/"],
    ["esc", "Escape"],
    ["f5", "F5"],
    ["arrowleft", "ArrowLeft"],
  ])("normalizes %s → %s", (input, expected) => {
    expect(normalizeShortcut(input)).toBe(expected);
  });

  it("rejects malformed shortcuts", () => {
    expect(() => normalizeShortcut("Mod+")).toThrow(/no key/);
    expect(() => normalizeShortcut("Hyper+K")).toThrow(/Unknown modifier/);
  });

  it("maps key events per platform", () => {
    expect(shortcutFromEvent({ ...KEY, key: "u", metaKey: true }, true)).toBe("Mod+U");
    expect(shortcutFromEvent({ ...KEY, key: "u", ctrlKey: true }, false)).toBe("Mod+U");
    expect(shortcutFromEvent({ ...KEY, key: "u", ctrlKey: true }, true)).toBe("U");
    expect(shortcutFromEvent({ ...KEY, key: "Z", shiftKey: true, ctrlKey: true }, false)).toBe(
      "Mod+Shift+Z",
    );
    // Shift that only produces a printable symbol is not a modifier.
    expect(shortcutFromEvent({ ...KEY, key: "?", shiftKey: true }, false)).toBe("?");
    expect(shortcutFromEvent({ ...KEY, key: "Meta", metaKey: true }, true)).toBeNull();
  });

  it("formats labels for tooltips", () => {
    expect(formatShortcut("Mod+Shift+U", true)).toBe("⌘⇧U");
    expect(formatShortcut("Mod+Shift+U", false)).toBe("Ctrl+Shift+U");
    expect(formatShortcut("Delete", false)).toBe("Del");
    expect(formatShortcut("/", true)).toBe("/");
  });
});
