import { useEffect } from "react";
import { applyAssetMessage } from "../lib/asset-events.ts";
import { connectSse } from "../lib/sse.ts";
import { useAssetsStore } from "../stores/assets.ts";
import { useAuthStore } from "../stores/auth.ts";
import { useExportsStore, type ExportStateEvent } from "../stores/exports.ts";

/**
 * The editor's live connection: asset state (an import uploading, processing, ready) and, for
 * `exportsFor`, that project's server exports. One connection for both; a reconnect reloads what
 * may have been missed.
 */
export function useEditorEvents(exportsFor: string | null): void {
  useEffect(() => {
    if (exportsFor !== null) void useExportsStore.getState().load(exportsFor);
    const auth = useAuthStore.getState();
    let first = true;
    const connection = connectSse({
      url: "/api/events",
      token: () => useAuthStore.getState().accessToken,
      refreshToken: () => auth.refresh(),
      onOpen: () => {
        if (!first) {
          void useAssetsStore.getState().load();
          if (exportsFor !== null) void useExportsStore.getState().load(exportsFor);
        }
        first = false;
      },
      onMessage: (message) => {
        if (message.event === "export") {
          if (exportsFor !== null) {
            useExportsStore.getState().applyEvent(JSON.parse(message.data) as ExportStateEvent);
          }
        } else {
          applyAssetMessage(message);
        }
      },
    });
    return () => {
      connection.close();
    };
  }, [exportsFor]);
}
