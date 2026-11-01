import { ActionRegistry } from "@lumacut/actions";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Tooltip } from "radix-ui";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionButton } from "./ActionButton.tsx";

afterEach(cleanup);

describe("ActionButton", () => {
  it("labels icon buttons, reflects availability and runs the action", () => {
    const run = vi.fn(() => undefined);
    const registry = new ActionRegistry<{ ok: boolean }>();
    const action = registry.register({
      id: "asset.delete",
      title: "Delete asset",
      description: "Delete it.",
      keywords: ["remove"],
      category: "Library",
      icon: "trash",
      shortcut: "Delete",
      when: (c) => c.ok,
      run,
    });
    const { rerender } = render(
      <Tooltip.Provider>
        <ActionButton action={action} ctx={{ ok: true }} variant="icon" />
      </Tooltip.Provider>,
    );
    const button = screen.getByRole("button", { name: "Delete asset" });
    expect(button.getAttribute("aria-keyshortcuts")).toBe("Delete");
    expect(button.textContent).toBe("");
    fireEvent.click(button);
    expect(run).toHaveBeenCalledOnce();
    rerender(
      <Tooltip.Provider>
        <ActionButton action={action} ctx={{ ok: false }} variant="label" />
      </Tooltip.Provider>,
    );
    expect(screen.getByRole("button", { name: "Delete asset" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(screen.getByText("Delete asset")).toBeTruthy();
  });
});
