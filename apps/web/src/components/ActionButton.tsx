import type { AnyAction } from "@lumacut/actions";
import { formatShortcut } from "@lumacut/actions";
import { Tooltip } from "radix-ui";
import { isMacPlatform } from "../lib/format.ts";
import { Icon } from "./Icon.tsx";

interface ActionButtonProps<Ctx> {
  action: AnyAction<Ctx>;
  ctx: Ctx;
  /** "icon": icon only (the title becomes the ARIA label); "label": icon + text. */
  variant?: "icon" | "label";
  className?: string;
  /**
   * How to run the action. Defaults to calling `action.run` directly, which is right for app-level
   * actions; actions that return project ops must be run through the host (`runAction`) instead.
   */
  onRun?: (action: AnyAction<Ctx>, args?: unknown) => void;
  /** Arguments to run the action with (e.g. which track a header button acts on). */
  args?: unknown;
  /** Toggle state to show and announce (tool selected, snapping on, track muted…). */
  pressed?: boolean;
}

/** Renders any registered action: tooltip (name, description, shortcut), ARIA label, availability. */
export function ActionButton<Ctx>({
  action,
  ctx,
  variant = "label",
  className = "",
  onRun,
  args,
  pressed,
}: ActionButtonProps<Ctx>) {
  const available = action.when(ctx);
  const shortcut = action.shortcut ? formatShortcut(action.shortcut, isMacPlatform()) : null;
  return (
    <Tooltip.Root delayDuration={300}>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          aria-label={action.title}
          aria-pressed={pressed}
          aria-keyshortcuts={action.shortcut?.replace("Mod", isMacPlatform() ? "Meta" : "Control")}
          disabled={!available}
          data-action={action.id}
          onClick={(event) => {
            event.stopPropagation();
            if (onRun === undefined) void action.run(ctx, args);
            else onRun(action, args);
          }}
          className={`inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium transition
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400
            disabled:cursor-not-allowed disabled:opacity-40 ${pressed === true ? "bg-sky-800 text-white" : ""} ${className}`}
        >
          {action.icon && <Icon name={action.icon} />}
          {variant === "label" && <span>{action.title}</span>}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          sideOffset={6}
          className="z-50 max-w-64 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-200 shadow-lg"
        >
          <div className="flex items-center justify-between gap-3 font-semibold text-neutral-50">
            <span>{action.title}</span>
            {shortcut && (
              <kbd className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono">{shortcut}</kbd>
            )}
          </div>
          <p className="mt-1 text-neutral-400">{action.description}</p>
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
