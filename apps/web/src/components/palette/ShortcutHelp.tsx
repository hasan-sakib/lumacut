import { formatShortcut, type ActionRegistry } from "@lumacut/actions";
import { Dialog } from "radix-ui";
import { isMacPlatform } from "../../lib/format.ts";

interface ShortcutHelpProps<Ctx> {
  registry: ActionRegistry<Ctx>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Every keyboard shortcut, grouped by category: generated from the registry, so it can't go stale. */
export function ShortcutHelp<Ctx>({ registry, open, onOpenChange }: ShortcutHelpProps<Ctx>) {
  const mac = isMacPlatform();
  const groups = new Map<string, { title: string; shortcut: string }[]>();
  for (const action of registry.list()) {
    if (action.shortcut === undefined) continue;
    groups.set(action.category, [...(groups.get(action.category) ?? []), { title: action.title, shortcut: action.shortcut }]);
  }
  const sorted = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-20 z-50 max-h-[80vh] w-[min(36rem,calc(100vw-2rem))] -translate-x-1/2 overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"
        >
          <Dialog.Title className="mb-3 text-base font-semibold text-neutral-100">Keyboard shortcuts</Dialog.Title>
          {sorted.map(([category, items]) => (
            <section key={category} className="mb-4">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{category}</h3>
              <dl className="grid gap-1 text-sm">
                {items
                  .sort((a, b) => a.title.localeCompare(b.title))
                  .map((item) => (
                    <div key={item.title} className="flex justify-between gap-4">
                      <dt className="text-neutral-200">{item.title}</dt>
                      <dd>
                        <kbd className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-xs text-neutral-300">
                          {formatShortcut(item.shortcut, mac)}
                        </kbd>
                      </dd>
                    </div>
                  ))}
              </dl>
            </section>
          ))}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
