import { describe, expect, it, vi } from "vitest";
import * as z from "zod";
import { ActionError, ActionRegistry, type Action } from "../src/index.ts";

interface Ctx {
  selected: string[];
}

function action(overrides: Partial<Action<Ctx>> = {}): Action<Ctx> {
  return {
    id: "asset.delete",
    title: "Delete asset",
    description: "Delete the selected asset and its files.",
    keywords: ["remove", "trash"],
    category: "Library",
    when: (ctx) => ctx.selected.length > 0,
    run: () => undefined,
    ...overrides,
  };
}

const KEY = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };

describe("ActionRegistry", () => {
  it("registers, lists and looks up actions", () => {
    const registry = new ActionRegistry<Ctx>();
    registry.register(action());
    expect(registry.get("asset.delete").title).toBe("Delete asset");
    expect(registry.list().map((a) => a.id)).toEqual(["asset.delete"]);
    expect(() => registry.get("nope.missing")).toThrow(ActionError);
  });

  it("enforces metadata every surface needs", () => {
    const registry = new ActionRegistry<Ctx>();
    expect(() => registry.register(action({ id: "Delete" }))).toThrow(/dotted lowerCamel/);
    expect(() => registry.register(action({ description: " " }))).toThrow(/description/);
    expect(() => registry.register(action({ keywords: [] }))).toThrow(/keyword/);
    registry.register(action());
    expect(() => registry.register(action())).toThrow(/already registered/);
  });

  it("normalizes shortcuts and rejects duplicates", () => {
    const registry = new ActionRegistry<Ctx>();
    expect(registry.register(action({ shortcut: "del" })).shortcut).toBe("Delete");
    expect(() => registry.register(action({ id: "asset.remove", shortcut: "Delete" }))).toThrow(
      /already used by "asset.delete"/,
    );
  });

  it("filters by `when` for menus, palette and AI", () => {
    const registry = new ActionRegistry<Ctx>();
    registry.register(action());
    registry.register(action({ id: "library.upload", when: () => true }));
    expect(registry.available({ selected: [] }).map((a) => a.id)).toEqual(["library.upload"]);
    expect(registry.available({ selected: ["a1"] })).toHaveLength(2);
  });

  it("dispatches key events only when the action is available", () => {
    const registry = new ActionRegistry<Ctx>();
    registry.register(action({ shortcut: "Delete" }));
    registry.register(action({ id: "library.upload", shortcut: "Mod+U", when: () => true }));
    const upload = { ...KEY, key: "u", metaKey: true };
    expect(registry.forKeyEvent(upload, { selected: [] }, true)?.id).toBe("library.upload");
    expect(
      registry.forKeyEvent({ ...upload, metaKey: false, ctrlKey: true }, { selected: [] }, true),
    ).toBeUndefined();
    const del = { ...KEY, key: "Delete" };
    expect(registry.forKeyEvent(del, { selected: [] }, false)).toBeUndefined();
    expect(registry.forKeyEvent(del, { selected: ["a"] }, false)?.id).toBe("asset.delete");
    expect(
      registry.forKeyEvent({ ...KEY, key: "Shift", shiftKey: true }, { selected: [] }, false),
    ).toBeUndefined();
  });

  it("validates args with the action's schema before running", async () => {
    const registry = new ActionRegistry<Ctx>();
    const run = vi.fn((_ctx: Ctx, args: { query: string }) => {
      expect(args.query).toBe("beach");
      return undefined;
    });
    registry.register<{ query: string }>({
      ...action({ id: "library.search", when: () => true }),
      argsSchema: z.strictObject({ query: z.string().max(200) }),
      run,
    });
    await registry.execute("library.search", { selected: [] }, { query: "beach" });
    expect(run).toHaveBeenCalledOnce();
    expect(() => registry.execute("library.search", { selected: [] }, { query: 5 })).toThrow();
  });

  it("refuses to run unavailable actions with a readable message", () => {
    const registry = new ActionRegistry<Ctx>();
    registry.register(action());
    expect(() => registry.execute("asset.delete", { selected: [] })).toThrow(
      `"Delete asset" isn't available right now`,
    );
  });
});

describe("ActionRegistry search, grouping and the tool list", () => {
  function many(): ActionRegistry<Ctx> {
    const r = new ActionRegistry<Ctx>();
    r.register(action({ id: "clip.split", title: "Split clip", keywords: ["cut", "razor"], category: "Edit", when: () => true }));
    r.register(action({ id: "clip.delete", title: "Delete clip", keywords: ["remove"], category: "Edit", when: (c) => c.selected.length > 0 }));
    r.register(action({ id: "lib.upload", title: "Upload media", keywords: ["import"], category: "Library", shortcut: "Mod+U", when: () => true }));
    r.register(
      action({
        id: "marker.add",
        title: "Add marker",
        keywords: ["flag"],
        category: "Edit",
        argsSchema: z.object({ label: z.string() }) as unknown as z.ZodType<undefined>,
        when: () => true,
      }),
    );
    return r;
  }

  it("search only offers actions available in the context, best first", () => {
    const r = many();
    expect(r.search("clip", { selected: [] }).map((h) => h.action.id)).toEqual(["clip.split"]);
    expect(r.search("clip", { selected: ["x"] }).map((h) => h.action.id).sort()).toEqual(["clip.delete", "clip.split"]);
    expect(r.search("razor", { selected: [] })[0]?.action.id).toBe("clip.split");
    expect(r.search("", { selected: [] }, 2)).toHaveLength(2);
  });

  it("groups available actions by category with sorted titles", () => {
    const groups = many().grouped({ selected: [] });
    expect(groups.map((g) => g.category)).toEqual(["Edit", "Library"]);
    expect(groups[0]?.actions.map((a) => a.title)).toEqual(["Add marker", "Split clip"]);
  });

  it("exports plain data for the AI, with JSON Schema args", () => {
    const tools = many().toToolList();
    expect(tools).toHaveLength(4);
    const marker = tools.find((t) => t.id === "marker.add");
    expect(marker?.args).toMatchObject({ type: "object", properties: { label: { type: "string" } } });
    expect(tools.find((t) => t.id === "clip.split")?.args).toBeNull();
    expect(tools.find((t) => t.id === "lib.upload")?.shortcut).toBe("Mod+U");
    expect(tools.find((t) => t.id === "clip.split")).not.toHaveProperty("shortcut");
    expect(JSON.stringify(tools)).not.toContain("function");
    expect(many().toToolList({ selected: [] }).map((t) => t.id)).not.toContain("clip.delete");
  });
});
