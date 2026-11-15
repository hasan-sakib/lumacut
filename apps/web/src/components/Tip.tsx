import { formatShortcut } from "@lumacut/actions";
import { Tooltip } from "radix-ui";
import type { ReactNode } from "react";
import { isMacPlatform } from "../lib/format.ts";

interface TipProps {
  title: string;
  description?: string;
  shortcut?: string | undefined;
  children: ReactNode;
}

/**
 * The rich tooltip every control gets (name, one-line description, shortcut), for buttons that
 * aren't registry `ActionButton`s. The child must be a single focusable element.
 */
export function Tip({ title, description, shortcut, children }: TipProps) {
  return (
    <Tooltip.Root delayDuration={300}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="bottom"
          sideOffset={6}
          className="z-50 max-w-72 rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-200 shadow-lg"
        >
          <span className="font-semibold text-neutral-100">{title}</span>
          {shortcut !== undefined && (
            <kbd className="ml-2 rounded bg-neutral-800 px-1 font-mono text-[10px] text-neutral-300">
              {formatShortcut(shortcut, isMacPlatform())}
            </kbd>
          )}
          {description !== undefined && <p className="mt-0.5 text-neutral-400">{description}</p>}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
