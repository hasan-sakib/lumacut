import { ActionRegistry } from "@lumacut/actions";

/** Side effects the player actions need; provided by the player page. */
export interface PlayerServices {
  togglePlay: () => void;
  /** Move the playhead by whole frames (negative = backwards); pauses first if playing. */
  stepFrames: (frames: number) => void;
  /** Move the playhead by a number of seconds, keeping it inside the composition. */
  skipSeconds: (seconds: number) => void;
  seekToStart: () => void;
  seekToEnd: () => void;
}

export interface PlayerContext {
  playing: boolean;
  /** There is something to play (at least one layer on the bench). */
  hasContent: boolean;
  services: PlayerServices;
}

export const playerActions = new ActionRegistry<PlayerContext>();

playerActions.register({
  id: "player.playPause",
  title: "Play / pause",
  description: "Start or stop playback of the composition from the playhead.",
  keywords: ["play", "pause", "stop", "start", "resume"],
  category: "Playback",
  icon: "play",
  shortcut: "Space",
  when: (ctx) => ctx.hasContent,
  run: (ctx) => {
    ctx.services.togglePlay();
    return undefined;
  },
});

playerActions.register({
  id: "player.stepForward",
  title: "Next frame",
  description: "Step the playhead forward by one frame.",
  keywords: ["frame", "forward", "advance", "next", "nudge"],
  category: "Playback",
  icon: "stepForward",
  shortcut: "ArrowRight",
  when: (ctx) => ctx.hasContent,
  run: (ctx) => {
    ctx.services.stepFrames(1);
    return undefined;
  },
});

playerActions.register({
  id: "player.stepBack",
  title: "Previous frame",
  description: "Step the playhead back by one frame.",
  keywords: ["frame", "back", "previous", "rewind", "nudge"],
  category: "Playback",
  icon: "stepBack",
  shortcut: "ArrowLeft",
  when: (ctx) => ctx.hasContent,
  run: (ctx) => {
    ctx.services.stepFrames(-1);
    return undefined;
  },
});

playerActions.register({
  id: "player.skipForward",
  title: "Forward 1 second",
  description: "Jump the playhead forward by one second.",
  keywords: ["skip", "jump", "forward", "second"],
  category: "Playback",
  icon: "skipForward",
  shortcut: "Shift+ArrowRight",
  when: (ctx) => ctx.hasContent,
  run: (ctx) => {
    ctx.services.skipSeconds(1);
    return undefined;
  },
});

playerActions.register({
  id: "player.skipBack",
  title: "Back 1 second",
  description: "Jump the playhead back by one second.",
  keywords: ["skip", "jump", "back", "rewind", "second"],
  category: "Playback",
  icon: "skipBack",
  shortcut: "Shift+ArrowLeft",
  when: (ctx) => ctx.hasContent,
  run: (ctx) => {
    ctx.services.skipSeconds(-1);
    return undefined;
  },
});

playerActions.register({
  id: "player.goToStart",
  title: "Go to start",
  description: "Move the playhead to the beginning of the composition.",
  keywords: ["beginning", "first", "home", "rewind"],
  category: "Playback",
  icon: "skipStart",
  shortcut: "Home",
  when: (ctx) => ctx.hasContent,
  run: (ctx) => {
    ctx.services.seekToStart();
    return undefined;
  },
});

playerActions.register({
  id: "player.goToEnd",
  title: "Go to end",
  description: "Move the playhead to the last frame of the composition.",
  keywords: ["last", "finish", "end"],
  category: "Playback",
  icon: "skipEnd",
  shortcut: "End",
  when: (ctx) => ctx.hasContent,
  run: (ctx) => {
    ctx.services.seekToEnd();
    return undefined;
  },
});
