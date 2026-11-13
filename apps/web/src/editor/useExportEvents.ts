import { useEffect } from "react";
import { connectSse } from "../lib/sse.ts";
import { useAuthStore } from "../stores/auth.ts";
import { useExportsStore, type ExportStateEvent } from "../stores/exports.ts";

/** Loads this project's server exports and keeps them live over SSE (reloads after a reconnect). */
export function useExportEvents(projectId: string | null): void {
  useEffect(() => {
    if (projectId === null) return;
    const store = useExportsStore.getState();
    void store.load(projectId);
    const auth = useAuthStore.getState();
    let first = true;
    const connection = connectSse({
      url: "/api/events",
      token: () => useAuthStore.getState().accessToken,
      refreshToken: () => auth.refresh(),
      onOpen: () => {
        if (!first) void useExportsStore.getState().load(projectId);
        first = false;
      },
      onMessage: (message) => {
        if (message.event === "export") {
          useExportsStore.getState().applyEvent(JSON.parse(message.data) as ExportStateEvent);
        }
      },
    });
    return () => {
      connection.close();
    };
  }, [projectId]);
}
