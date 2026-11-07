import { ActionRegistry } from "@lumacut/actions";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";
import { must } from "../../lib/must.ts";
import { ActionContextMenu } from "./ActionContextMenu.tsx";
import { CommandPalette } from "./CommandPalette.tsx";
import { ShortcutHelp } from "./ShortcutHelp.tsx";

interface Ctx {
  selected: boolean;
}

function registry(): ActionRegistry<Ctx> {
  const r = new ActionRegistry<Ctx>();
  const base = { category: "Edit", keywords: ["x"], when: () => true, run: () => undefined };
  r.register({
    ...base,
    id: "clip.split",
    title: "Split clip at playhead",
    description: "Cut the selected clip into two.",
    keywords: ["razor", "cut"],
    icon: "split",
    shortcut: "S",
  });
  r.register({
    ...base,
    id: "clip.delete",
    title: "Delete clip",
    description: "Remove the selected clip.",
    keywords: ["trash"],
    shortcut: "Delete",
    when: (c) => c.selected,
  });
  r.register({
    ...base,
    id: "marker.add",
    title: "Add marker",
    description: "Drop a marker at the playhead.",
    keywords: ["flag"],
    category: "Timeline",
    argsSchema: z.object({
      label: z.string(),
      loud: z.boolean().optional(),
    }) as unknown as z.ZodType<undefined>,
  });
  return r;
}

afterEach(cleanup);

function setup(
  over: { run?: (id: string, args?: unknown) => Promise<string | null>; ctx?: Ctx } = {},
) {
  const run = vi.fn(over.run ?? (() => Promise.resolve(null)));
  const onOpenChange = vi.fn();
  render(
    <CommandPalette
      registry={registry()}
      ctx={over.ctx ?? { selected: true }}
      open
      onOpenChange={onOpenChange}
      run={run}
    />,
  );
  return { run, onOpenChange, input: screen.getByRole("combobox", { name: "Search commands" }) };
}

describe("CommandPalette", () => {
  it("lists the commands available in the context, with shortcuts", () => {
    setup({ ctx: { selected: false } });
    const options = screen.getAllByRole("option").map((o) => o.getAttribute("data-action"));
    expect(options.sort()).toEqual(["clip.split", "marker.add"]); // delete needs a selection
    expect(screen.getByText("S", { selector: "kbd" })).toBeTruthy();
  });

  it("filters by synonym and runs the first result with Enter, then closes", async () => {
    const { run, onOpenChange, input } = setup();
    fireEvent.change(input, { target: { value: "razor" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(run).toHaveBeenCalledWith("clip.split", undefined);
    });
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("arrow keys move the selection (aria-activedescendant follows) and Enter runs that one", async () => {
    const { run, input } = setup();
    const first = screen.getAllByRole("option")[0];
    expect(first?.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const options = screen.getAllByRole("option");
    expect(options[1]?.getAttribute("aria-selected")).toBe("true");
    expect(input.getAttribute("aria-activedescendant")).toBe(options[1]?.id);
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(screen.getAllByRole("option")[0]?.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(run).toHaveBeenCalledTimes(1);
    });
    expect(run.mock.calls[0]?.[0]).toBe(options[1]?.getAttribute("data-action"));
  });

  it("clicking a result runs it", async () => {
    const { run } = setup();
    fireEvent.click(
      must(
        screen.getAllByRole("option").find((o) => o.getAttribute("data-action") === "clip.delete"),
      ),
    );
    await waitFor(() => {
      expect(run).toHaveBeenCalledWith("clip.delete", undefined);
    });
  });

  it("says so when nothing matches", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "zzzzqqq" } });
    expect(screen.getByText(/No command matches/)).toBeTruthy();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("asks for arguments with a generated form, validates, then runs with typed values", async () => {
    const { run, input } = setup();
    fireEvent.change(input, { target: { value: "marker" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const label = await screen.findByLabelText(/label/);
    expect(run).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(screen.getByRole("alert").textContent).toMatch(/Fill in “label”/);
    expect(run).not.toHaveBeenCalled();
    fireEvent.change(label, { target: { value: "Intro" } });
    fireEvent.click(screen.getByLabelText(/loud/));
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => {
      expect(run).toHaveBeenCalledWith("marker.add", { label: "Intro", loud: true });
    });
  });

  it("Back returns to the search", async () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "marker" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await screen.findByLabelText(/label/);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("combobox", { name: "Search commands" })).toBeTruthy();
  });

  it("shows the message when running fails and stays open", async () => {
    const { onOpenChange, input } = setup({
      run: () => Promise.resolve("Track “Video 1” is locked."),
    });
    fireEvent.change(input, { target: { value: "split" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/locked/);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe("ShortcutHelp", () => {
  it("lists every shortcut by category, generated from the registry", () => {
    render(<ShortcutHelp registry={registry()} open onOpenChange={() => undefined} />);
    expect(screen.getByRole("heading", { name: "Keyboard shortcuts" })).toBeTruthy();
    expect(screen.getByText("Split clip at playhead")).toBeTruthy();
    expect(screen.getByText("Delete clip")).toBeTruthy();
    expect(screen.queryByText("Add marker")).toBeNull(); // no shortcut, so not listed
  });
});

describe("ActionContextMenu", () => {
  it("offers the available actions and runs the chosen one", async () => {
    const onRun = vi.fn();
    render(
      <ActionContextMenu registry={registry()} ctx={{ selected: false }} onRun={onRun}>
        <div data-testid="area">area</div>
      </ActionContextMenu>,
    );
    fireEvent.contextMenu(screen.getByTestId("area"));
    const split = await screen.findByRole("menuitem", { name: /Split clip at playhead/ });
    expect(screen.queryByRole("menuitem", { name: /Delete clip/ })).toBeNull();
    fireEvent.click(split);
    await waitFor(() => {
      expect(onRun).toHaveBeenCalledWith("clip.split");
    });
  });

  it("can be limited to some actions", async () => {
    render(
      <ActionContextMenu
        registry={registry()}
        ctx={{ selected: true }}
        onRun={() => undefined}
        actionIds={["clip.delete"]}
      >
        <div data-testid="area">area</div>
      </ActionContextMenu>,
    );
    fireEvent.contextMenu(screen.getByTestId("area"));
    expect(await screen.findAllByRole("menuitem")).toHaveLength(1);
  });
});
