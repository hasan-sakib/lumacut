import { cleanup, render, screen } from "@testing-library/react";
import { Tooltip } from "radix-ui";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppRoutes } from "./App.tsx";
import { useAuthStore } from "./stores/auth.ts";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  return render(
    <Tooltip.Provider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </Tooltip.Provider>,
  );
}

describe("routing", () => {
  it("sends signed-out users to login, which shows stack health", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json({ status: "ok", checks: { database: { status: "ok", detail: null } } }),
        ),
      ),
    );
    useAuthStore.setState({ status: "anonymous", user: null, accessToken: null });
    renderAt("/");
    expect(await screen.findByRole("heading", { name: "Log in" })).toBeTruthy();
    expect(await screen.findByText("All services are healthy.")).toBeTruthy();
  });

  it("offers registration from the login page", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    useAuthStore.setState({ status: "anonymous", user: null, accessToken: null });
    renderAt("/register");
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Log in" }).getAttribute("href")).toBe("/login");
  });
});
