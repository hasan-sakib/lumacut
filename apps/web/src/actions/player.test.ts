import { describe, expect, it, vi } from "vitest";
import { playerActions, type PlayerContext, type PlayerServices } from "./player.ts";

function ctx(partial: Partial<PlayerContext> = {}): {
  ctx: PlayerContext;
  services: PlayerServices;
} {
  const services: PlayerServices = {
    togglePlay: vi.fn(),
    stepFrames: vi.fn(),
    skipSeconds: vi.fn(),
    seekToStart: vi.fn(),
    seekToEnd: vi.fn(),
  };
  return { ctx: { playing: false, hasContent: true, services, ...partial }, services };
}

const key = (k: string, shift = false) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: shift,
});

describe("player actions", () => {
  it("are registered with tooltip metadata and unique shortcuts", () => {
    const all = playerActions.list();
    expect(all.map((a) => a.id).sort()).toEqual([
      "player.goToEnd",
      "player.goToStart",
      "player.playPause",
      "player.skipBack",
      "player.skipForward",
      "player.stepBack",
      "player.stepForward",
    ]);
    for (const action of all) {
      expect(action.title).not.toBe("");
      expect(action.description.length).toBeGreaterThan(10);
      expect(action.icon).toBeDefined();
    }
    const shortcuts = all.map((a) => a.shortcut);
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });

  it("are all unavailable until there is something to play", () => {
    expect(playerActions.available(ctx({ hasContent: false }).ctx)).toEqual([]);
    expect(playerActions.available(ctx().ctx)).toHaveLength(7);
  });

  it("are triggered by their keys, and Shift+arrow differs from arrow", async () => {
    const { ctx: c, services } = ctx();
    const run = async (event: ReturnType<typeof key>) => {
      await playerActions.forKeyEvent(event, c, true)?.run(c, undefined);
    };
    await run(key(" "));
    await run(key("ArrowRight"));
    await run(key("ArrowLeft"));
    await run(key("ArrowRight", true));
    await run(key("ArrowLeft", true));
    await run(key("Home"));
    await run(key("End"));
    expect(services.togglePlay).toHaveBeenCalledTimes(1);
    expect(services.stepFrames).toHaveBeenNthCalledWith(1, 1);
    expect(services.stepFrames).toHaveBeenNthCalledWith(2, -1);
    expect(services.skipSeconds).toHaveBeenNthCalledWith(1, 1);
    expect(services.skipSeconds).toHaveBeenNthCalledWith(2, -1);
    expect(services.seekToStart).toHaveBeenCalledTimes(1);
    expect(services.seekToEnd).toHaveBeenCalledTimes(1);
  });
});
