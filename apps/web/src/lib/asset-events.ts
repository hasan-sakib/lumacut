import { useAssetsStore, type AssetStateEvent } from "../stores/assets.ts";

/** Applies a live `snapshot` or `asset` message to the assets store; other events are ignored. */
export function applyAssetMessage(message: { event: string; data: string }): void {
  const store = useAssetsStore.getState();
  if (message.event === "snapshot") {
    for (const e of JSON.parse(message.data) as AssetStateEvent[]) store.applyEvent(e);
  } else if (message.event === "asset") {
    store.applyEvent(JSON.parse(message.data) as AssetStateEvent);
  }
}
