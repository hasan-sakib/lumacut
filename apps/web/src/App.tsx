import { useEffect, useState } from "react";
import { fetchHealth, type HealthState } from "./api/health.ts";
import { HealthStatus } from "./components/HealthStatus.tsx";

export const HEALTH_POLL_MS = 3000;

function useHealth(pollMs: number): HealthState {
  const [state, setState] = useState<HealthState>({ kind: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      const next = await fetchHealth(controller.signal);
      if (controller.signal.aborted) return;
      setState(next);
      timer = setTimeout(() => void poll(), pollMs);
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [pollMs]);
  return state;
}

export function App() {
  const health = useHealth(HEALTH_POLL_MS);
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center gap-8 p-10">
      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Lumacut</h1>
        <p className="text-neutral-400">Video, motion graphics and photo editing in one studio.</p>
      </header>
      <HealthStatus state={health} />
      <p className="text-sm text-neutral-500" data-testid="isolation">
        Cross-origin isolated: {window.crossOriginIsolated ? "yes" : "no"}
      </p>
    </main>
  );
}
