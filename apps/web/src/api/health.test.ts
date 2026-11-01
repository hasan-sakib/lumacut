import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHealth, type HealthReport } from "./health.ts";

const OK_REPORT: HealthReport = {
  status: "ok",
  checks: { database: { status: "ok", detail: null } },
};

function stubFetch(impl: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchHealth", () => {
  it("returns the report on 200", async () => {
    stubFetch(() => Promise.resolve(Response.json(OK_REPORT, { status: 200 })));
    expect(await fetchHealth()).toEqual({ kind: "report", report: OK_REPORT });
  });

  it("returns the degraded report on 503", async () => {
    const degraded: HealthReport = {
      status: "degraded",
      checks: { worker: { status: "error", detail: "no RQ worker is registered" } },
    };
    stubFetch(() => Promise.resolve(Response.json(degraded, { status: 503 })));
    expect(await fetchHealth()).toEqual({ kind: "report", report: degraded });
  });

  it("treats other status codes as unreachable", async () => {
    stubFetch(() => Promise.resolve(new Response("bad gateway", { status: 502 })));
    expect(await fetchHealth()).toEqual({
      kind: "unreachable",
      reason: "API responded with HTTP 502",
    });
  });

  it("treats network errors as unreachable", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    const state = await fetchHealth();
    expect(state.kind).toBe("unreachable");
  });

  it("rejects malformed bodies", async () => {
    stubFetch(() => Promise.resolve(Response.json({ status: "maybe" }, { status: 200 })));
    expect(await fetchHealth()).toEqual({
      kind: "unreachable",
      reason: "API returned an unexpected health response",
    });
  });
});
