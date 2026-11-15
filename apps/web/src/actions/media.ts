import * as z from "zod";
import { activeComposition, editingActions } from "./editing.ts";

editingActions.register({
  id: "media.import",
  title: "Import media",
  description:
    "Choose files from your computer: videos, photos and music in a video project, images in a photo project. They upload to your library and are added to the project when ready. You can also drop files on the editor.",
  keywords: [
    "import",
    "upload",
    "add",
    "open",
    "file",
    "video",
    "photo",
    "image",
    "music",
    "audio",
    "footage",
    "from computer",
  ],
  category: "Media",
  icon: "upload",
  shortcut: "Mod+I",
  when: (ctx) => ctx.services.media !== undefined && activeComposition(ctx) !== undefined,
  run: (ctx) => {
    ctx.services.media?.import();
    return undefined;
  },
});

editingActions.register({
  id: "media.cancelImport",
  title: "Cancel import",
  description: "Stop an upload that is still in progress and remove the file from your library.",
  keywords: ["cancel", "stop", "abort", "upload", "import"],
  category: "Media",
  icon: "cancel",
  argsSchema: z.object({ upload: z.string().describe("The upload's key") }),
  when: (ctx) => ctx.services.media !== undefined,
  run: (ctx, args) => {
    void ctx.services.media?.cancel(args.upload);
    return undefined;
  },
});
