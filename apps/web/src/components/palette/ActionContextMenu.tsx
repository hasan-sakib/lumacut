import { formatShortcut, type ActionRegistry } from "@lumacut/actions";
import { ContextMenu } from "radix-ui";
import type { ReactNode } from "react";
import { isMacPlatform } from "../../lib/format.ts";
import { Icon } from "../Icon.tsx";

interface ActionContextMenuProps<Ctx> {
  registry: ActionRegistry<Ctx>;
  ctx: Ctx;
  /** Runs the chosen action. */
  onRun: (id: string) => void;
  /** Limit the menu to these actions (default: everything available in the context). */
  actionIds?: readonly string[];
  children: ReactNode;
}

/** Right-click menu generated from the actions whose `when()` holds: nothing is listed by hand. */
export function ActionContextMenu<Ctx>({
  registry,
  ctx,
  onRun,
  actionIds,
  children,
}: ActionContextMenuProps<Ctx>) {
  const mac = isMacPlatform();
  const groups = registry
    .grouped(ctx)
    .map((g) => ({
      ...g,
      actions: g.actions.filter((a) => actionIds === undefined || actionIds.includes(a.id)),
    }))
    .filter((g) => g.actions.length > 0);
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="z-50 min-w-56 rounded-md border border-neutral-700 bg-neutral-900 p-1 text-sm shadow-xl">
          {groups.length === 0 && (
            <div className="px-2 py-1.5 text-neutral-500">Nothing to do here.</div>
          )}
          {groups.map((group, i) => (
            <div key={group.category}>
              {i > 0 && <ContextMenu.Separator className="my-1 h-px bg-neutral-800" />}
              <ContextMenu.Label className="px-2 py-1 text-xs text-neutral-500">
                {group.category}
              </ContextMenu.Label>
              {group.actions.map((action) => (
                <ContextMenu.Item
                  key={action.id}
                  onSelect={() => {
                    onRun(action.id);
                  }}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-neutral-800"
                >
                  {action.icon && <Icon name={action.icon} />}
                  <span className="flex-1">{action.title}</span>
                  {action.shortcut && (
                    <kbd className="font-mono text-xs text-neutral-400">
                      {formatShortcut(action.shortcut, mac)}
                    </kbd>
                  )}
                </ContextMenu.Item>
              ))}
            </div>
          ))}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
