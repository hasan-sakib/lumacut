import type { AnyAction } from "@lumacut/actions";
import { DropdownMenu } from "radix-ui";
import { useState } from "react";
import { editingActions, type EditingContext } from "../../actions/editing.ts";
import { WORKSPACES } from "../../actions/workspaces.ts";
import { usePrefsStore } from "../../stores/prefs.ts";

interface WorkspaceMenuProps {
  ctx: EditingContext;
  onRun: (action: AnyAction<EditingContext>, args?: unknown) => void;
  photo: boolean;
}

/** Built-in and saved panel arrangements, plus "Save current…". */
export function WorkspaceMenu({ ctx, onRun, photo }: WorkspaceMenuProps) {
  const current = usePrefsStore((s) => s.workspace);
  const saved = usePrefsStore((s) => s.savedWorkspaces);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const builtIns = WORKSPACES.filter((w) => w.photo === photo);
  const label =
    builtIns.find((w) => w.id === current)?.name ??
    saved.find((w) => w.id === current)?.name ??
    "Workspace";
  const item =
    "flex cursor-pointer items-center justify-between gap-4 rounded px-2 py-1.5 outline-none data-[highlighted]:bg-neutral-800";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        title="Workspaces: panel arrangements for editing, motion, colour and audio"
        aria-label={`Workspace: ${label}`}
        className="rounded bg-neutral-900 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
      >
        {label} ▾
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-56 rounded-md border border-neutral-700 bg-neutral-900 p-1 text-xs shadow-xl"
        >
          {builtIns.map((w) => (
            <DropdownMenu.Item
              key={w.id}
              className={item}
              onSelect={() => {
                onRun(editingActions.get(`workspace.${w.id}`));
              }}
            >
              <span>{w.name}</span>
              <kbd className="font-mono text-neutral-500">{w.key.replace("Alt+", "⌥")}</kbd>
            </DropdownMenu.Item>
          ))}
          {saved.length > 0 && <DropdownMenu.Separator className="my-1 h-px bg-neutral-800" />}
          {saved.map((w) => (
            <DropdownMenu.Item
              key={w.id}
              className={item}
              onSelect={() => {
                onRun(editingActions.get("workspace.use"), { name: w.id });
              }}
            >
              <span>{w.name}</span>
              <button
                type="button"
                title={`Delete the “${w.name}” workspace`}
                aria-label={`Delete the ${w.name} workspace`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRun(editingActions.get("workspace.delete"), { name: w.id });
                }}
                className="rounded px-1 text-neutral-500 hover:text-red-300"
              >
                ✕
              </button>
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="my-1 h-px bg-neutral-800" />
          {naming ? (
            <form
              className="flex gap-1 p-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim() === "") return;
                onRun(editingActions.get("workspace.save"), { name });
                setNaming(false);
                setName("");
              }}
            >
              <input
                autoFocus
                aria-label="Workspace name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                }}
                className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5"
              />
              <button type="submit" className="rounded bg-sky-700 px-2 text-white">
                Save
              </button>
            </form>
          ) : (
            <DropdownMenu.Item
              className={item}
              disabled={!editingActions.get("workspace.save").when(ctx)}
              onSelect={(e) => {
                e.preventDefault();
                setNaming(true);
              }}
            >
              Save current arrangement…
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
