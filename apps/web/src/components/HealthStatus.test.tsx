import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HealthStatus } from "./HealthStatus.tsx";

afterEach(cleanup);

describe("HealthStatus", () => {
  it("shows a loading message first", () => {
    render(<HealthStatus state={{ kind: "loading" }} />);
    expect(screen.getByRole("status").textContent).toBe("Checking services…");
  });

  it("lists every check with a text status when healthy", () => {
    render(
      <HealthStatus
        state={{
          kind: "report",
          report: {
            status: "ok",
            checks: {
              database: { status: "ok", detail: null },
              worker: { status: "ok", detail: null },
            },
          },
        }}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe("All services are healthy.");
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "Database (PostgreSQL)OK",
      "Media worker (FFmpeg)OK",
    ]);
  });

  it("shows failing checks with their detail", () => {
    render(
      <HealthStatus
        state={{
          kind: "report",
          report: {
            status: "degraded",
            checks: { queue: { status: "error", detail: "ConnectionError: refused" } },
          },
        }}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe("Some services are down.");
    const item = screen.getByRole("listitem");
    expect(within(item).getByText("Error")).toBeTruthy();
    expect(within(item).getByText("ConnectionError: refused")).toBeTruthy();
  });

  it("explains how to start the stack when the API is unreachable", () => {
    render(<HealthStatus state={{ kind: "unreachable", reason: "Network error" }} />);
    expect(screen.getByRole("alert").textContent).toContain("make up");
  });
});
