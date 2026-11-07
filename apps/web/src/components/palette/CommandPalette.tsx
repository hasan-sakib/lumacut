import {
  describeArgs,
  formatShortcut,
  type ActionRegistry,
  type AnyAction,
  type ArgField,
} from "@lumacut/actions";
import { Dialog } from "radix-ui";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { isMacPlatform } from "../../lib/format.ts";
import { Icon } from "../Icon.tsx";

interface CommandPaletteProps<Ctx> {
  registry: ActionRegistry<Ctx>;
  ctx: Ctx;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Runs an action; resolves with an error message to show, or null on success. */
  run: (id: string, args?: unknown) => Promise<string | null>;
}

type FieldValues = Record<string, string | boolean>;

/** Turns what was typed into the args object the action's schema expects (empty optional fields are left out). */
function collectArgs(fields: ArgField[], values: FieldValues): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values[field.name];
    if (field.kind === "boolean") {
      if (value === true || !field.optional) args[field.name] = value === true;
    } else if (typeof value === "string" && value.trim() !== "") {
      args[field.name] =
        field.kind === "number" || field.kind === "integer" ? Number(value) : value;
    }
  }
  return args;
}

/**
 * The command palette (Mod+K): fuzzy search over every action available right now, with its
 * shortcut beside it. Actions that take arguments get a small form generated from their schema.
 * Works from the keyboard alone: type, arrows, Enter, Esc.
 */
export function CommandPalette<Ctx>({
  registry,
  ctx,
  open,
  onOpenChange,
  run,
}: CommandPaletteProps<Ctx>) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-24 z-50 w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl"
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          {/* Its state lives in the body, which exists only while the dialog is open: closing resets it. */}
          <PaletteBody registry={registry} ctx={ctx} onOpenChange={onOpenChange} run={run} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PaletteBody<Ctx>({
  registry,
  ctx,
  onOpenChange,
  run,
}: Omit<CommandPaletteProps<Ctx>, "open">) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pending, setPending] = useState<{ action: AnyAction<Ctx>; fields: ArgField[] } | null>(
    null,
  );
  const [values, setValues] = useState<FieldValues>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const firstField = useRef<HTMLInputElement | HTMLSelectElement>(null);

  const hits = useMemo(() => registry.search(query, ctx, 30), [registry, query, ctx]);
  const mac = isMacPlatform();

  useEffect(() => {
    if (pending !== null) firstField.current?.focus();
  }, [pending]);

  async function execute(action: AnyAction<Ctx>, args?: unknown) {
    setBusy(true);
    const message = await run(action.id, args);
    setBusy(false);
    if (message === null) onOpenChange(false);
    else setError(message);
  }

  function choose(action: AnyAction<Ctx>) {
    setError(null);
    const fields = action.argsSchema === undefined ? [] : describeArgs(action.argsSchema);
    if (fields === null || fields.length === 0) {
      void execute(action);
      return;
    }
    setValues({});
    setPending({ action, fields });
  }

  function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (pending === null) return;
    const missing = pending.fields.find(
      (f) => !f.optional && f.kind !== "boolean" && String(values[f.name] ?? "").trim() === "",
    );
    if (missing !== undefined) {
      setError(`Fill in “${missing.name}” first.`);
      return;
    }
    void execute(pending.action, collectArgs(pending.fields, values));
  }

  const activeIndex = Math.min(active, Math.max(0, hits.length - 1));
  const activeHit = hits[activeIndex];

  return (
    <>
      {pending === null ? (
        <>
          <div className="flex items-center gap-2 border-b border-neutral-800 px-3">
            <Icon name="search" className="h-4 w-4 text-neutral-500" />
            <input
              autoFocus
              role="combobox"
              aria-label="Search commands"
              aria-expanded={hits.length > 0}
              aria-controls={listId}
              aria-activedescendant={
                activeHit === undefined ? undefined : `${listId}-${activeHit.action.id}`
              }
              aria-autocomplete="list"
              value={query}
              placeholder="Type a command or what you want to do…"
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, hits.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter" && activeHit !== undefined && !busy) {
                  e.preventDefault();
                  choose(activeHit.action);
                }
              }}
              className="w-full bg-transparent py-3 text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
            />
          </div>
          <ul
            id={listId}
            role="listbox"
            aria-label="Commands"
            className="max-h-80 overflow-y-auto p-1"
          >
            {hits.length === 0 && (
              <li role="presentation" className="px-3 py-6 text-center text-sm text-neutral-500">
                {query.trim() === ""
                  ? "Nothing is available right now."
                  : `No command matches “${query.trim()}”.`}
              </li>
            )}
            {hits.map(({ action }, i) => (
              <li
                key={action.id}
                id={`${listId}-${action.id}`}
                role="option"
                aria-selected={i === activeIndex}
                data-action={action.id}
                onMouseMove={() => {
                  setActive(i);
                }}
                onClick={() => {
                  choose(action);
                }}
                className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm ${i === activeIndex ? "bg-sky-900/60" : ""}`}
              >
                {action.icon && (
                  <Icon name={action.icon} className="h-4 w-4 shrink-0 text-neutral-400" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-neutral-100">{action.title}</span>
                  <span className="block truncate text-xs text-neutral-500">
                    {action.description}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-neutral-500">{action.category}</span>
                {action.shortcut && (
                  <kbd className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-xs text-neutral-300">
                    {formatShortcut(action.shortcut, mac)}
                  </kbd>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <form
          onSubmit={submit}
          className="flex flex-col gap-3 p-4"
          aria-label={pending.action.title}
        >
          <h2 className="text-sm font-semibold text-neutral-100">{pending.action.title}</h2>
          {pending.fields.map((field, i) => (
            <label key={field.name} className="flex flex-col gap-1 text-xs text-neutral-300">
              <span>
                {field.name}
                {field.optional ? " (optional)" : ""}
                {field.description ? ` — ${field.description}` : ""}
              </span>
              {field.kind === "enum" ? (
                <select
                  ref={i === 0 ? (firstField as React.RefObject<HTMLSelectElement>) : undefined}
                  value={String(values[field.name] ?? field.options?.[0] ?? "")}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [field.name]: e.target.value }));
                  }}
                  className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100"
                >
                  {field.options?.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : field.kind === "boolean" ? (
                <input
                  type="checkbox"
                  checked={values[field.name] === true}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [field.name]: e.target.checked }));
                  }}
                  className="h-4 w-4 accent-sky-500"
                />
              ) : (
                <input
                  ref={i === 0 ? (firstField as React.RefObject<HTMLInputElement>) : undefined}
                  type={field.kind === "string" ? "text" : "number"}
                  step={field.kind === "integer" ? 1 : "any"}
                  min={field.min}
                  max={field.max}
                  value={String(values[field.name] ?? "")}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [field.name]: e.target.value }));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setPending(null);
                      setError(null);
                    }
                  }}
                  className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-sky-500"
                />
              )}
            </label>
          ))}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setPending(null);
                setError(null);
              }}
              className="rounded-md px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            >
              Run
            </button>
          </div>
        </form>
      )}
      {error !== null && (
        <p
          role="alert"
          className="border-t border-red-900 bg-red-950/50 px-4 py-2 text-sm text-red-200"
        >
          {error}
        </p>
      )}
    </>
  );
}
