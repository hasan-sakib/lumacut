import type { HealthState } from "../api/health.ts";

const LABELS: Record<string, string> = {
  database: "Database (PostgreSQL)",
  queue: "Job queue (Valkey)",
  storage: "Object storage (S3)",
  worker: "Media worker (FFmpeg)",
};

interface HealthStatusProps {
  state: HealthState;
}

/** Lists each backend dependency with a text status (never color alone). */
export function HealthStatus({ state }: HealthStatusProps) {
  return (
    <section aria-labelledby="stack-status-heading" className="w-full max-w-xl">
      <h2 id="stack-status-heading" className="mb-3 text-lg font-semibold">
        Stack status
      </h2>
      {state.kind === "loading" && <p role="status">Checking services…</p>}
      {state.kind === "unreachable" && (
        <p role="alert" className="rounded border border-red-500/60 bg-red-950/40 p-3">
          API unreachable. {state.reason}. Start the stack with <code>make up</code>.
        </p>
      )}
      {state.kind === "report" && (
        <>
          <p role="status" className="mb-3">
            {state.report.status === "ok" ? "All services are healthy." : "Some services are down."}
          </p>
          <ul className="divide-y divide-neutral-800 rounded border border-neutral-800">
            {Object.entries(state.report.checks).map(([name, check]) => (
              <li
                key={name}
                data-check={name}
                className="flex items-start justify-between gap-4 p-3"
              >
                <div>
                  <div className="font-medium">{LABELS[name] ?? name}</div>
                  {check.detail !== null && (
                    <div className="text-sm text-neutral-400">{check.detail}</div>
                  )}
                </div>
                <span
                  className={
                    check.status === "ok"
                      ? "rounded bg-emerald-900/60 px-2 py-0.5 text-sm text-emerald-200"
                      : "rounded bg-red-900/60 px-2 py-0.5 text-sm text-red-200"
                  }
                >
                  {check.status === "ok" ? "OK" : "Error"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
