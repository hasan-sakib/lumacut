import { useEffect, useState } from "react";
import { fetchHealth, type HealthState } from "../api/health.ts";

export const HEALTH_POLL_MS = 3000;

export function useHealth(pollMs: number = HEALTH_POLL_MS): HealthState {
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
