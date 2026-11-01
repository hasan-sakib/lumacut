import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("polls /api/health and renders the result", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        Response.json({ status: "ok", checks: { storage: { status: "ok", detail: null } } }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);
    expect(await screen.findByText("All services are healthy.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/health", expect.anything());
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Lumacut");
  });
});
