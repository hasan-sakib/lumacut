import { applyOp, durationOps, OpError, type OpErrorCode } from "@lumacut/ops";
import type { Op, Project } from "@lumacut/schema";
import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";
import { projectClient, type ProjectClient } from "../api/projects.ts";

export type SaveState = "saved" | "dirty" | "saving" | "offline" | "conflict" | "error";

/** One undo step: `undo` restores the state before, `redo` repeats the change. */
export interface HistoryEntry {
  label: string;
  undo: Op;
  redo: Op;
  /** Edits that share a key and arrive close together (a slider drag) merge into one step. */
  coalesceKey?: string;
  at: number;
}

export interface DispatchOptions {
  label?: string;
  coalesceKey?: string;
}

export type DispatchResult =
  { ok: true } | { ok: false; code: OpErrorCode | "no_project"; message: string };

export interface ProjectState {
  projectId: string | null;
  project: Project | null;
  version: number;
  loading: boolean;
  loadError: string | null;
  saveState: SaveState;
  saveError: string | null;
  /** Server's version when a save hit a conflict. */
  serverVersion: number | null;
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  open: (id: string) => Promise<void>;
  close: () => void;
  /** The only way to change the document: validates, applies, records history, schedules a save. */
  dispatch: (op: Op, options?: DispatchOptions) => DispatchResult;
  undo: () => DispatchResult;
  redo: () => DispatchResult;
  saveNow: () => Promise<void>;
  resolveConflict: (choice: "reload" | "overwrite") => Promise<void>;
}

export interface ProjectStoreDeps {
  client: ProjectClient;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
}

/** Quiet time after the last edit before autosave runs, and the most an edit can wait. */
export const AUTOSAVE_IDLE_MS = 1500;
export const AUTOSAVE_MAX_MS = 10_000;
/** Edits with the same coalesce key closer together than this form one undo step. */
export const COALESCE_WINDOW_MS = 1000;
export const MAX_HISTORY = 200;
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 30_000;

const defaultDeps: ProjectStoreDeps = {
  client: projectClient,
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

const EMPTY = {
  projectId: null,
  project: null,
  version: 0,
  loading: false,
  loadError: null,
  saveState: "saved" as SaveState,
  saveError: null,
  serverVersion: null,
  undoStack: [] as HistoryEntry[],
  redoStack: [] as HistoryEntry[],
};

function failure(error: unknown): DispatchResult {
  if (error instanceof OpError) return { ok: false, code: error.code, message: error.message };
  throw error;
}

export function createProjectStore(
  overrides: Partial<ProjectStoreDeps> = {},
): StoreApi<ProjectState> {
  const deps = { ...defaultDeps, ...overrides };
  let idleTimer: unknown = null;
  let maxTimer: unknown = null;
  let retryTimer: unknown = null;
  let retryDelay = RETRY_BASE_MS;
  let inFlight = false;
  /** Bumped when another project is opened so a late response can't land in the wrong one. */
  let session = 0;

  const store = createStore<ProjectState>()((set, get) => {
    const clearTimers = () => {
      for (const t of [idleTimer, maxTimer, retryTimer]) if (t !== null) deps.clearTimer(t);
      idleTimer = maxTimer = retryTimer = null;
    };

    const scheduleSave = () => {
      if (get().saveState === "conflict") return;
      set({ saveState: "dirty", saveError: null });
      if (idleTimer !== null) deps.clearTimer(idleTimer);
      idleTimer = deps.setTimer(() => void get().saveNow(), AUTOSAVE_IDLE_MS);
      maxTimer ??= deps.setTimer(() => void get().saveNow(), AUTOSAVE_MAX_MS);
    };

    const record = (entry: HistoryEntry, merge: boolean) => {
      set((s) => {
        const top = s.undoStack.at(-1);
        if (merge && top !== undefined) {
          const merged: HistoryEntry = {
            ...top,
            at: entry.at,
            undo: { type: "batch", ops: [entry.undo, top.undo] },
            redo: { type: "batch", ops: [top.redo, entry.redo] },
          };
          return { undoStack: [...s.undoStack.slice(0, -1), merged], redoStack: [] };
        }
        return { undoStack: [...s.undoStack, entry].slice(-MAX_HISTORY), redoStack: [] };
      });
    };

    return {
      ...EMPTY,

      async open(id) {
        clearTimers();
        const mine = ++session;
        set({ ...EMPTY, projectId: id, loading: true });
        try {
          const loaded = await deps.client.load(id);
          if (mine !== session) return;
          set({ project: loaded.project, version: loaded.version, loading: false });
        } catch (error) {
          if (mine !== session) return;
          set({
            loading: false,
            loadError: error instanceof Error ? error.message : "Couldn't open this project.",
          });
        }
      },

      close() {
        session += 1;
        clearTimers();
        set({ ...EMPTY });
      },

      dispatch(op, options = {}) {
        const { project } = get();
        if (project === null)
          return { ok: false, code: "no_project", message: "No project is open." };
        const label = options.label ?? labelFor(op);
        let applied: Op = op;
        let result;
        try {
          result = applyOp(project, op);
          // A composition is as long as its content: fold the duration update into the same step.
          const fixes = durationOps(result.project);
          if (fixes.length > 0) {
            applied = { type: "batch", label, ops: [op, ...fixes] };
            result = applyOp(project, applied);
          }
        } catch (error) {
          return failure(error);
        }
        const now = deps.now();
        const top = get().undoStack.at(-1);
        const merge =
          options.coalesceKey !== undefined &&
          top?.coalesceKey === options.coalesceKey &&
          now - top.at <= COALESCE_WINDOW_MS;
        set({ project: result.project });
        record(
          {
            label,
            undo: result.inverse,
            redo: applied,
            ...(options.coalesceKey === undefined ? {} : { coalesceKey: options.coalesceKey }),
            at: now,
          },
          merge,
        );
        scheduleSave();
        return { ok: true };
      },

      undo() {
        const { project, undoStack } = get();
        const entry = undoStack.at(-1);
        if (project === null || entry === undefined) {
          return { ok: false, code: "no_project", message: "There is nothing to undo." };
        }
        let result;
        try {
          result = applyOp(project, entry.undo);
        } catch (error) {
          return failure(error);
        }
        set((s) => ({
          project: result.project,
          undoStack: s.undoStack.slice(0, -1),
          redoStack: [...s.redoStack, { ...entry, undo: entry.undo, redo: result.inverse }],
        }));
        scheduleSave();
        return { ok: true };
      },

      redo() {
        const { project, redoStack } = get();
        const entry = redoStack.at(-1);
        if (project === null || entry === undefined) {
          return { ok: false, code: "no_project", message: "There is nothing to redo." };
        }
        let result;
        try {
          result = applyOp(project, entry.redo);
        } catch (error) {
          return failure(error);
        }
        set((s) => ({
          project: result.project,
          redoStack: s.redoStack.slice(0, -1),
          undoStack: [...s.undoStack, { ...entry, undo: result.inverse }],
        }));
        scheduleSave();
        return { ok: true };
      },

      async saveNow() {
        clearTimers();
        const state = get();
        if (state.project === null || state.projectId === null) return;
        if (state.saveState === "conflict" || state.saveState === "saved") return;
        if (inFlight) return; // the running save reschedules itself if more edits arrived
        inFlight = true;
        const mine = session;
        const sent = state.project;
        set({ saveState: "saving" });
        const outcome = await deps.client.save(state.projectId, state.version, sent);
        inFlight = false;
        if (mine !== session) return;
        if (outcome.kind === "saved") {
          retryDelay = RETRY_BASE_MS;
          const edited = get().project !== sent;
          set({ version: outcome.version, saveState: edited ? "dirty" : "saved", saveError: null });
          if (edited) scheduleSave();
        } else if (outcome.kind === "conflict") {
          set({ saveState: "conflict", serverVersion: outcome.currentVersion, saveError: null });
        } else {
          set({ saveState: outcome.retryable ? "offline" : "error", saveError: outcome.message });
          if (outcome.retryable) {
            retryTimer = deps.setTimer(() => {
              retryTimer = null;
              set({ saveState: "dirty" });
              void get().saveNow();
            }, retryDelay);
            retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
          }
        }
      },

      async resolveConflict(choice) {
        const { projectId, serverVersion } = get();
        if (projectId === null || get().saveState !== "conflict") return;
        if (choice === "overwrite") {
          // Keep my copy: adopt the server's version number so the next save is accepted.
          set({ version: serverVersion ?? get().version, saveState: "dirty", serverVersion: null });
          await get().saveNow();
          return;
        }
        await get().open(projectId);
      },
    };
  });

  return store;
}

function labelFor(op: Op): string {
  if (op.type === "batch") return op.label ?? "Edit";
  return op.type.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

/** The app's project store. */
export const projectStore = createProjectStore();

export function useProjectStore<T>(selector: (state: ProjectState) => T): T {
  return useStore(projectStore, selector);
}
