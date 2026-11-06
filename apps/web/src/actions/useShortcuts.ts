import type { ActionRegistry } from "@lumacut/actions";
import { useEffect, useRef } from "react";
import { isMacPlatform } from "../lib/format.ts";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  // A range slider takes no text, so playback keys keep working after scrubbing.
  if (target instanceof HTMLInputElement) return target.type !== "range";
  return target.isContentEditable || ["TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Space/Enter on a focused button or link already activate it; running the action too would fire twice. */
function activatesNatively(target: EventTarget | null, shortcut: string | undefined): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const clickable = ["BUTTON", "A", "SUMMARY"].includes(target.tagName) || target.role === "button";
  return clickable && (shortcut === "Space" || shortcut === "Enter");
}

/** Dispatches keyboard shortcuts from the registry (the shortcut map is generated, not wired). */
export function useShortcuts<Ctx>(registry: ActionRegistry<Ctx>, ctx: Ctx): void {
  const ctxRef = useRef(ctx);
  useEffect(() => {
    ctxRef.current = ctx;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const typing = isTyping(event.target);
      const action = registry.forKeyEvent(event, ctxRef.current, isMacPlatform());
      if (action === undefined) return;
      // While typing, only modifier shortcuts apply (e.g. Mod+U), never bare keys like "/".
      if (typing && !action.shortcut?.startsWith("Mod")) return;
      if (activatesNatively(event.target, action.shortcut)) return;
      event.preventDefault();
      void action.run(ctxRef.current, undefined);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [registry]);
}
