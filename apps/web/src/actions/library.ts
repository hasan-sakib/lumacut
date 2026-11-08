import { ActionRegistry } from "@lumacut/actions";
import * as z from "zod";
import type { AssetOut } from "../api/client.ts";
import type { ViewMode } from "../stores/ui.ts";

/** Side effects the library actions need; provided by the library page. */
export interface LibraryServices {
  pickAndUpload: () => Promise<void>;
  /** Create an empty project and open it. */
  createProject: () => Promise<void>;
  /**
   * Create a photo project and open it: a blank canvas of this size, or (with `assetId`) one sized
   * to that library image and starting with the image as its first layer.
   */
  createPhoto?: (options: { width: number; height: number; assetId?: string }) => Promise<void>;
  focusSearch: () => void;
  setView: (view: ViewMode) => void;
  askDelete: (assetId: string) => void;
  retry: (assetId: string) => Promise<void>;
  resume: (assetId: string) => Promise<void>;
  cancelUpload: (key: string) => Promise<void>;
  logout: () => Promise<void>;
}

/** What an action can see: the asset it targets (card, row, selection) and app state. */
export interface LibraryContext {
  asset: AssetOut | null;
  /** Key of this tab's in-flight upload for `asset`, if any. */
  uploadKey: string | null;
  view: ViewMode;
  services: LibraryServices;
}

export const libraryActions = new ActionRegistry<LibraryContext>();

libraryActions.register({
  id: "library.upload",
  title: "Upload media",
  description: "Add videos, audio or images to your library. You can also drop files anywhere.",
  keywords: ["import", "add", "file", "video", "photo", "audio", "open"],
  category: "Library",
  icon: "upload",
  shortcut: "Mod+U",
  when: () => true,
  run: (ctx) => {
    void ctx.services.pickAndUpload();
    return undefined;
  },
});

libraryActions.register({
  id: "project.new",
  title: "New project",
  description: "Create an empty video project and open the editor.",
  keywords: ["create", "start", "edit", "video", "composition"],
  category: "Project",
  icon: "plus",
  shortcut: "Mod+Shift+N",
  when: () => true,
  run: (ctx) => {
    void ctx.services.createProject();
    return undefined;
  },
});

const sideSchema = z.number().int().min(1).max(16384);

libraryActions.register({
  id: "project.newPhoto",
  title: "New photo",
  description:
    "Create a photo project with a blank canvas (default 2048 × 2048 px) and open the photo editor.",
  keywords: ["photo", "image", "picture", "graphic", "canvas", "retouch", "poster", "layers"],
  category: "Project",
  icon: "plus",
  argsSchema: z.object({
    width: sideSchema.optional().describe("Canvas width in pixels (default 2048)"),
    height: sideSchema.optional().describe("Canvas height in pixels (default 2048)"),
  }),
  when: () => true,
  run: (ctx, args) => {
    const { width, height } = args;
    void ctx.services.createPhoto?.({ width: width ?? 2048, height: height ?? 2048 });
    return undefined;
  },
});

libraryActions.register({
  id: "project.newPhotoFromImage",
  title: "Edit photo",
  description:
    "Open the selected image in the photo editor: a new photo project sized to the image, with the image as its first layer.",
  keywords: ["photo", "edit image", "retouch", "open image", "layers"],
  category: "Project",
  icon: "plus",
  when: (ctx) =>
    ctx.asset?.kind === "image" &&
    ctx.asset.status === "ready" &&
    ctx.asset.media?.image !== undefined &&
    ctx.asset.media.image !== null,
  run: (ctx) => {
    const image = ctx.asset?.media?.image;
    if (ctx.asset === null || image === undefined || image === null) return undefined;
    void ctx.services.createPhoto?.({
      width: image.width,
      height: image.height,
      assetId: ctx.asset.id,
    });
    return undefined;
  },
});

libraryActions.register({
  id: "library.search",
  title: "Search library",
  description: "Find assets by name.",
  keywords: ["find", "filter", "look up"],
  category: "Library",
  icon: "search",
  shortcut: "/",
  when: () => true,
  run: (ctx) => {
    ctx.services.focusSearch();
    return undefined;
  },
});

libraryActions.register({
  id: "library.toggleView",
  title: "Switch grid / list view",
  description: "Show the library as thumbnails or as a detailed list.",
  keywords: ["layout", "table", "thumbnails", "list", "grid"],
  category: "View",
  icon: "list",
  shortcut: "Mod+Shift+L",
  when: () => true,
  run: (ctx) => {
    ctx.services.setView(ctx.view === "grid" ? "list" : "grid");
    return undefined;
  },
});

libraryActions.register({
  id: "asset.retry",
  title: "Retry processing",
  description: "Process the failed asset again from its original upload.",
  keywords: ["again", "reprocess", "fix", "failed"],
  category: "Library",
  icon: "retry",
  when: (ctx) => ctx.asset?.status === "failed",
  run: (ctx) => {
    if (ctx.asset) void ctx.services.retry(ctx.asset.id);
    return undefined;
  },
});

libraryActions.register({
  id: "asset.delete",
  title: "Delete asset",
  description: "Delete the asset and all of its files. This can't be undone.",
  keywords: ["remove", "trash", "erase"],
  category: "Library",
  icon: "trash",
  shortcut: "Delete",
  when: (ctx) => ctx.asset !== null,
  run: (ctx) => {
    if (ctx.asset) ctx.services.askDelete(ctx.asset.id);
    return undefined;
  },
});

libraryActions.register({
  id: "upload.resume",
  title: "Resume upload",
  description: "Continue an interrupted upload; only the missing parts are sent.",
  keywords: ["continue", "restart", "paused", "interrupted"],
  category: "Library",
  icon: "resume",
  when: (ctx) => ctx.asset?.status === "uploading" && ctx.uploadKey === null,
  run: (ctx) => {
    if (ctx.asset) void ctx.services.resume(ctx.asset.id);
    return undefined;
  },
});

libraryActions.register({
  id: "upload.cancel",
  title: "Cancel upload",
  description: "Stop this upload and remove the unfinished asset.",
  keywords: ["stop", "abort"],
  category: "Library",
  icon: "cancel",
  when: (ctx) => ctx.uploadKey !== null,
  run: (ctx) => {
    if (ctx.uploadKey) void ctx.services.cancelUpload(ctx.uploadKey);
    return undefined;
  },
});

libraryActions.register({
  id: "auth.logout",
  title: "Log out",
  description: "Sign out of Lumacut on this device.",
  keywords: ["sign out", "exit", "account"],
  category: "Account",
  icon: "logout",
  when: () => true,
  run: (ctx) => {
    void ctx.services.logout();
    return undefined;
  },
});
