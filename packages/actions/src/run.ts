import type { Op } from "@lumacut/schema";
import type { ActionRegistry } from "./registry.ts";

/**
 * Runs an action and hands any ops it returns to `apply`, one undo step per action: a single op
 * as is, several ops as a `batch` labelled with the action's title. App-level actions that return
 * nothing just perform their effect. Throws `ActionError` when the action isn't available.
 */
export async function runAction<Ctx>(
  registry: ActionRegistry<Ctx>,
  id: string,
  ctx: Ctx,
  args: unknown,
  apply: (op: Op, label: string) => void,
): Promise<void> {
  const result = await registry.execute(id, ctx, args);
  if (result === undefined) return;
  const label = registry.get(id).title;
  const ops = Array.isArray(result) ? result : [result];
  if (ops.length === 0) return;
  const [only] = ops;
  apply(ops.length === 1 && only !== undefined ? only : { type: "batch", label, ops }, label);
}
