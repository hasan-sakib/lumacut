import type { Op } from "@lumacut/schema";
import type * as z from "zod";
import { normalizeShortcut, shortcutFromEvent, type KeyEventLike } from "./shortcuts.ts";

/**
 * What running an action produces. Project edits return Ops (applied through packages/ops);
 * app-level commands (upload, log out, …) perform their effect and return nothing.
 */
export type ActionResult = Op | Op[] | undefined | Promise<undefined>;

/** A user-facing feature, defined once. Every UI surface and the AI derive from these. */
export interface Action<Ctx, Args = undefined> {
  /** Stable dotted id, e.g. "asset.delete". */
  id: string;
  title: string;
  description: string;
  /** Synonyms for search (palette, Ask). */
  keywords: readonly string[];
  category: string;
  /** Icon name understood by the UI's icon set. */
  icon?: string;
  /** Canonical or loose shortcut text ("Mod+U", "delete"); normalized on registration. */
  shortcut?: string;
  when: (ctx: Ctx) => boolean;
  argsSchema?: z.ZodType<Args>;
  run: (ctx: Ctx, args: Args) => ActionResult;
}

// Registries store actions with heterogeneous argument types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyAction<Ctx> = Action<Ctx, any>;

export class ActionError extends Error {
  override name = "ActionError";
}

export class ActionRegistry<Ctx> {
  readonly #actions = new Map<string, AnyAction<Ctx>>();
  readonly #shortcuts = new Map<string, string>();

  register<Args>(action: Action<Ctx, Args>): Action<Ctx, Args> {
    if (!/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/.test(action.id)) {
      throw new ActionError(
        `Action id "${action.id}" must be dotted lowerCamel, e.g. asset.delete`,
      );
    }
    if (this.#actions.has(action.id)) {
      throw new ActionError(`Action "${action.id}" is already registered`);
    }
    if (!action.title.trim() || !action.description.trim()) {
      throw new ActionError(`Action "${action.id}" needs a title and a description`);
    }
    if (action.keywords.length === 0) {
      throw new ActionError(`Action "${action.id}" needs at least one keyword`);
    }
    let normalized = action;
    if (action.shortcut !== undefined) {
      const shortcut = normalizeShortcut(action.shortcut);
      const taken = this.#shortcuts.get(shortcut);
      if (taken !== undefined) {
        throw new ActionError(
          `Shortcut ${shortcut} of "${action.id}" is already used by "${taken}"`,
        );
      }
      this.#shortcuts.set(shortcut, action.id);
      normalized = { ...action, shortcut };
    }
    this.#actions.set(action.id, normalized);
    return normalized;
  }

  get(id: string): AnyAction<Ctx> {
    const action = this.#actions.get(id);
    if (action === undefined) throw new ActionError(`Unknown action "${id}"`);
    return action;
  }

  list(): AnyAction<Ctx>[] {
    return [...this.#actions.values()];
  }

  /** Actions whose `when` holds in this context (menus, palette, the AI tool list). */
  available(ctx: Ctx): AnyAction<Ctx>[] {
    return this.list().filter((a) => a.when(ctx));
  }

  /** The action bound to this key event, if it is available in the context. */
  forKeyEvent(event: KeyEventLike, ctx: Ctx, isMac: boolean): AnyAction<Ctx> | undefined {
    const shortcut = shortcutFromEvent(event, isMac);
    if (shortcut === null) return undefined;
    const id = this.#shortcuts.get(shortcut);
    if (id === undefined) return undefined;
    const action = this.get(id);
    return action.when(ctx) ? action : undefined;
  }

  /** Validates args against argsSchema and runs the action; refuses if unavailable. */
  execute(id: string, ctx: Ctx, args?: unknown): ActionResult {
    const action = this.get(id);
    if (!action.when(ctx)) {
      throw new ActionError(`"${action.title}" isn't available right now`);
    }
    const parsed: unknown = action.argsSchema ? action.argsSchema.parse(args) : undefined;
    return action.run(ctx, parsed);
  }
}
