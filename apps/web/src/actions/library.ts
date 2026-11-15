import { ActionRegistry } from "@lumacut/actions";
import * as z from "zod";
import type { AssetOut } from "../api/client.ts";
import type { ThemeChoice } from "../stores/prefs.ts";
import type { ViewMode } from "../stores/ui.ts";

/** The start screen's sections (sidebar). */
export type HomeSection = "home" | "projects" | "templates" | "media";

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
  /** Create an empty video project of this size and open it. */
  createVideo?: (width: number, height: number) => Promise<void>;
  /** Start a project from a template (built-in id, or `saved:<id>`). */
  useTemplate?: (key: string) => Promise<void>;
  /** Remove one of your saved templates. */
  deleteTemplate?: (id: string) => Promise<void>;
  /** Open the "New project" chooser (video shapes, photo, template). */
  chooseNewProject?: () => void;
  /** Show one of the start screen's sections. */
  showSection?: (section: HomeSection) => void;
  /** Open an existing project in the editor. */
  openProject?: (projectId: string) => void;
  /** Ask for confirmation, then delete a project. */
  askDeleteProject?: (projectId: string) => void;
  /** Light, dark or follow the system. */
  setTheme?: (theme: ThemeChoice) => void;
  /** Flip between light and dark. */
  toggleTheme?: () => void;
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
  description: "Start a new video, photo or template project.",
  keywords: ["create", "start", "edit", "video", "photo", "template", "composition"],
  category: "Project",
  icon: "plus",
  shortcut: "Mod+Shift+N",
  when: () => true,
  run: (ctx) => {
    if (ctx.services.chooseNewProject !== undefined) ctx.services.chooseNewProject();
    else void ctx.services.createProject();
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
  title: "Search",
  description: "Find projects, templates or media by name.",
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

const ASPECTS = {
  "9:16": [1080, 1920],
  "16:9": [1920, 1080],
  "1:1": [1080, 1080],
  "4:5": [1080, 1350],
} as const;

libraryActions.register({
  id: "project.newVideo",
  title: "New video",
  description:
    "Create an empty video project in a shape: 9:16 (reels, TikTok, Shorts), 16:9 (YouTube), 1:1 or 4:5 (posts).",
  keywords: [
    "new",
    "video",
    "reel",
    "vertical",
    "portrait",
    "landscape",
    "square",
    "aspect",
    "9:16",
    "16:9",
  ],
  category: "Project",
  icon: "plus",
  argsSchema: z.object({ aspect: z.enum(["9:16", "16:9", "1:1", "4:5"]) }),
  when: (ctx) => ctx.services.createVideo !== undefined,
  run: (ctx, args) => {
    const [width, height] = ASPECTS[args.aspect];
    void ctx.services.createVideo?.(width, height);
    return undefined;
  },
});

libraryActions.register({
  id: "template.use",
  title: "Start from a template",
  description:
    "Create a project from a template (reels, intros, lower thirds, slideshows, quote cards) and open it with its slots ready to fill.",
  keywords: [
    "template",
    "start",
    "reel",
    "intro",
    "lower third",
    "slideshow",
    "quote",
    "preset project",
  ],
  category: "Project",
  icon: "layers",
  argsSchema: z.object({ template: z.string().describe("Template id (see the gallery)") }),
  when: (ctx) => ctx.services.useTemplate !== undefined,
  run: (ctx, args) => {
    void ctx.services.useTemplate?.(args.template);
    return undefined;
  },
});

libraryActions.register({
  id: "template.delete",
  title: "Remove a saved template",
  description: "Remove one of your own templates (projects made from it are not affected).",
  keywords: ["template", "delete", "remove"],
  category: "Project",
  argsSchema: z.object({ template: z.string() }),
  when: (ctx) => ctx.services.deleteTemplate !== undefined,
  run: (ctx, args) => {
    void ctx.services.deleteTemplate?.(args.template.replace(/^saved:/, ""));
    return undefined;
  },
});

const projectArgs = z.object({ project: z.string().describe("Project id") });

libraryActions.register({
  id: "project.open",
  title: "Open project",
  description: "Open this project in the editor.",
  keywords: ["open", "existing", "continue", "edit", "resume"],
  category: "Project",
  icon: "folder",
  argsSchema: projectArgs,
  when: (ctx) => ctx.services.openProject !== undefined,
  run: (ctx, args) => {
    ctx.services.openProject?.(args.project);
    return undefined;
  },
});

libraryActions.register({
  id: "project.delete",
  title: "Delete project",
  description:
    "Delete this project permanently, after you confirm. Your media stays in the library.",
  keywords: ["remove", "trash", "discard"],
  category: "Project",
  icon: "trash",
  argsSchema: projectArgs,
  when: (ctx) => ctx.services.askDeleteProject !== undefined,
  run: (ctx, args) => {
    ctx.services.askDeleteProject?.(args.project);
    return undefined;
  },
});

const SECTIONS: {
  section: HomeSection;
  id: string;
  title: string;
  description: string;
  icon: string;
  keywords: string[];
}[] = [
  {
    section: "home",
    id: "home.showHome",
    title: "Home",
    description: "Start something new and pick up recent projects.",
    icon: "home",
    keywords: ["start", "dashboard", "overview"],
  },
  {
    section: "projects",
    id: "home.showProjects",
    title: "Projects",
    description: "All of your projects: open, search, sort or delete them.",
    icon: "folder",
    keywords: ["existing", "open", "my projects", "recent"],
  },
  {
    section: "templates",
    id: "home.showTemplates",
    title: "Templates",
    description: "Start from a reel, intro, lower third, slideshow or quote card.",
    icon: "template",
    keywords: ["gallery", "presets", "starter"],
  },
  {
    section: "media",
    id: "home.showMedia",
    title: "Media",
    description: "Your uploaded videos, audio and images.",
    icon: "image",
    keywords: ["library", "assets", "files", "uploads"],
  },
];

for (const s of SECTIONS) {
  libraryActions.register({
    id: s.id,
    title: s.title,
    description: s.description,
    keywords: s.keywords,
    category: "Go to",
    icon: s.icon,
    when: (ctx) => ctx.services.showSection !== undefined,
    run: (ctx) => {
      ctx.services.showSection?.(s.section);
      return undefined;
    },
  });
}

const THEMES: { theme: ThemeChoice; title: string; description: string; icon: string }[] = [
  { theme: "light", title: "Light theme", description: "Use the light appearance.", icon: "sun" },
  { theme: "dark", title: "Dark theme", description: "Use the dark appearance.", icon: "moon" },
  {
    theme: "system",
    title: "System theme",
    description: "Follow your device's light or dark setting.",
    icon: "monitor",
  },
];

for (const t of THEMES) {
  libraryActions.register({
    id: `theme.${t.theme}`,
    title: t.title,
    description: `${t.description} The editor itself always stays dark.`,
    keywords: ["appearance", "mode", "color scheme", "night", "day"],
    category: "Appearance",
    icon: t.icon,
    when: (ctx) => ctx.services.setTheme !== undefined,
    run: (ctx) => {
      ctx.services.setTheme?.(t.theme);
      return undefined;
    },
  });
}

libraryActions.register({
  id: "theme.toggle",
  title: "Switch light / dark",
  description: "Flip between the light and dark appearance.",
  keywords: ["appearance", "theme", "night", "day", "color scheme"],
  category: "Appearance",
  icon: "moon",
  shortcut: "Alt+T",
  when: (ctx) => ctx.services.toggleTheme !== undefined,
  run: (ctx) => {
    ctx.services.toggleTheme?.();
    return undefined;
  },
});
