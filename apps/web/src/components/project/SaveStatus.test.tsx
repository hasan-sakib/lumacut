import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { SaveState } from "../../stores/project.ts";
import { SaveStatus } from "./SaveStatus.tsx";

afterEach(cleanup);

describe("SaveStatus", () => {
  it.each<[SaveState, RegExp]>([
    ["saved", /saved/i],
    ["dirty", /unsaved/i],
    ["saving", /saving/i],
    ["offline", /offline/i],
    ["conflict", /elsewhere/i],
    ["error", /couldn't save/i],
  ])("says what %s means, politely announced", (state, text) => {
    render(<SaveStatus state={state} detail="why" />);
    const el = screen.getByRole("status");
    expect(el.textContent).toMatch(text);
    expect(el.getAttribute("aria-live")).toBe("polite");
    expect(el.getAttribute("data-state")).toBe(state);
    expect(el.getAttribute("title")).toBe("why");
  });
});
