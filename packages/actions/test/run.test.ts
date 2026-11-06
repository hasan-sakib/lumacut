import type { Op } from "@lumacut/schema";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";
import { ActionError, ActionRegistry, runAction, type Action } from "../src/index.ts";

const trim: Op = { type: "trimClip", clipId: "c", edge: "end", toUs: 1 };
const other: Op = { type: "removeClip", clipId: "c" };

function registry(): ActionRegistry<{ ok: boolean }> {
  const r = new ActionRegistry<{ ok: boolean }>();
  const base = { description: "Does something useful.", keywords: ["k"], category: "Edit", when: (c: { ok: boolean }) => c.ok } satisfies Partial<Action<{ ok: boolean }>>;
  r.register({ ...base, id: "t.none", title: "Nothing", run: () => undefined });
  r.register({ ...base, id: "t.one", title: "One op", run: () => trim });
  r.register({ ...base, id: "t.many", title: "Many ops", run: () => [trim, other] });
  r.register({ ...base, id: "t.empty", title: "Empty list", run: () => [] });
  r.register({
    ...base,
    id: "t.args",
    title: "With args",
    argsSchema: z.object({ to: z.number() }),
    run: (_c, args: { to: number }) => ({ ...trim, toUs: args.to }) as Op,
  });
  return r;
}

describe("runAction", () => {
  it("passes a single op as is and several as one labelled batch", async () => {
    const apply = vi.fn();
    await runAction(registry(), "t.one", { ok: true }, undefined, apply);
    expect(apply).toHaveBeenLastCalledWith(trim, "One op");
    await runAction(registry(), "t.many", { ok: true }, undefined, apply);
    expect(apply).toHaveBeenLastCalledWith({ type: "batch", label: "Many ops", ops: [trim, other] }, "Many ops");
  });

  it("does nothing for actions that return nothing", async () => {
    const apply = vi.fn();
    await runAction(registry(), "t.none", { ok: true }, undefined, apply);
    await runAction(registry(), "t.empty", { ok: true }, undefined, apply);
    expect(apply).not.toHaveBeenCalled();
  });

  it("validates args and refuses unavailable actions", async () => {
    const apply = vi.fn();
    await runAction(registry(), "t.args", { ok: true }, { to: 5 }, apply);
    expect(apply).toHaveBeenLastCalledWith({ ...trim, toUs: 5 }, "With args");
    await expect(runAction(registry(), "t.args", { ok: true }, { to: "x" }, apply)).rejects.toThrow();
    await expect(runAction(registry(), "t.one", { ok: false }, undefined, apply)).rejects.toThrow(ActionError);
  });
});
