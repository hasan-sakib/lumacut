/** Client for GET /api/health (types generated from the API's OpenAPI document). */
import type { HealthReport } from "./client.ts";

export type { HealthReport };

export type HealthState =
  | { kind: "loading" }
  | { kind: "report"; report: HealthReport }
  | { kind: "unreachable"; reason: string };

function isHealthReport(value: unknown): value is HealthReport {
  if (typeof value !== "object" || value === null) return false;
  const { status, checks } = value as Record<string, unknown>;
  if (status !== "ok" && status !== "degraded") return false;
  if (typeof checks !== "object" || checks === null) return false;
  return Object.values(checks).every(
    (c: unknown) =>
      typeof c === "object" &&
      c !== null &&
      ((c as { status?: unknown }).status === "ok" ||
        (c as { status?: unknown }).status === "error"),
  );
}

/** 200 and 503 both carry a report; anything else means the API itself is unreachable. */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthState> {
  let res: Response;
  try {
    res = await fetch("/api/health", { signal: signal ?? null });
  } catch (error) {
    return { kind: "unreachable", reason: `Network error: ${String(error)}` };
  }
  if (res.status !== 200 && res.status !== 503) {
    return { kind: "unreachable", reason: `API responded with HTTP ${String(res.status)}` };
  }
  const body: unknown = await res.json().catch(() => null);
  if (!isHealthReport(body)) {
    return { kind: "unreachable", reason: "API returned an unexpected health response" };
  }
  return { kind: "report", report: body };
}
