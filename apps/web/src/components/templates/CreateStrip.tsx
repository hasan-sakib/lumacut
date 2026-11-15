import type { LibraryContext } from "../../actions/library.ts";
import { libraryActions } from "../../actions/library.ts";
import type { SavedTemplate } from "../../api/templates.ts";
import { ActionButton } from "../ActionButton.tsx";
import { TemplateGallery } from "./TemplateGallery.tsx";

const SIZES = [
  { aspect: "9:16", label: "Reel / Short", hint: "1080 × 1920" },
  { aspect: "16:9", label: "Video", hint: "1920 × 1080" },
  { aspect: "1:1", label: "Square", hint: "1080 × 1080" },
  { aspect: "4:5", label: "Portrait post", hint: "1080 × 1350" },
] as const;

interface CreateStripProps {
  ctx: LibraryContext;
  saved: readonly SavedTemplate[];
  busy: string | null;
}

/** The start screen's "Create" area: a blank video in a common shape, a photo, or a template. */
export function CreateStrip({ ctx, saved, busy }: CreateStripProps) {
  const run = (id: string, args?: unknown) => {
    void libraryActions.execute(id, ctx, args);
  };
  return (
    <section aria-label="Create" className="mb-8 flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Create</h2>
      <div className="flex flex-wrap gap-2">
        {SIZES.map((s) => (
          <button
            key={s.aspect}
            type="button"
            title={`New ${s.aspect} video (${s.hint})`}
            aria-label={`New ${s.label} video, ${s.aspect}`}
            onClick={() => {
              run("project.newVideo", { aspect: s.aspect });
            }}
            className="flex min-w-32 flex-col items-start rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left hover:border-sky-500"
          >
            <span className="text-sm font-medium text-neutral-100">{s.label}</span>
            <span className="text-xs text-neutral-500">
              {s.aspect} · {s.hint}
            </span>
          </button>
        ))}
        <ActionButton
          action={libraryActions.get("project.newPhoto")}
          ctx={ctx}
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 hover:border-sky-500"
        />
      </div>
      <h3 className="text-sm font-semibold text-neutral-300">Start from a template</h3>
      <TemplateGallery
        saved={saved}
        busy={busy}
        onUse={(item) => {
          run("template.use", { template: item.key });
        }}
        onDelete={(item) => {
          run("template.delete", { template: item.key });
        }}
      />
    </section>
  );
}
