import type { ActionRegistry, AnyAction } from "@lumacut/actions";
import { useEffect, useRef } from "react";
import { isMacPlatform } from "../lib/format.ts";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  // A range slider takes no text, so playback keys keep working after scrubbing.
  if (target instanceof HTMLInputElement) return target.type !== "range";
  return target.isContentEditable || ["TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Shortcuts a text field needs for itself (select all, copy, cut, paste, undo, redo). */
const TEXT_EDITING = /^Mod\+(?:Shift\+)?[ACVXYZ]$/;

/** Space/Enter on a focused button or link already activate it; running the action too would fire twice. */
function activatesNatively(target: EventTarget | null, shortcut: string | undefined): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const clickable = ["BUTTON", "A", "SUMMARY"].includes(target.tagName) || target.role === "button";
  return clickable && (shortcut === "Space" || shortcut === "Enter");
}

/** Dispatches keyboard shortcuts from the registry (the shortcut map is generated, not wired). */
/**
 * `onRun` decides how a triggered action runs; pass it for registries whose actions return project
 * ops (so they get applied). Without it the action's `run` is just called.
 */
export function useShortcuts<Ctx>(
  registry: ActionRegistry<Ctx>,
  ctx: Ctx,
  onRun?: (action: AnyAction<Ctx>) => void,
): void {
  const ctxRef = useRef(ctx);
  const onRunRef = useRef(onRun);
  useEffect(() => {
    ctxRef.current = ctx;
    onRunRef.current = onRun;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const typing = isTyping(event.target);
      const action = registry.forKeyEvent(event, ctxRef.current, isMacPlatform());
      if (action === undefined) return;
      // While typing, only modifier shortcuts apply (e.g. Mod+U), never bare keys like "/", and
      // never the ones a text field uses itself (copy, paste, undo…).
      if (typing && (!action.shortcut?.startsWith("Mod") || TEXT_EDITING.test(action.shortcut)))
        return;
      if (activatesNatively(event.target, action.shortcut)) return;
      event.preventDefault();
      if (onRunRef.current === undefined) void action.run(ctxRef.current, undefined);
      else onRunRef.current(action);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [registry]);
}
