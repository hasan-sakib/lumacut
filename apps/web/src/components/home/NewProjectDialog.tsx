import { Dialog } from "radix-ui";
import { Icon } from "../Icon.tsx";
import { SHAPES, ShapeGlyph } from "./shapes.tsx";

interface NewProjectDialogProps {
  open: boolean;
  onClose: () => void;
  run: (actionId: string, args?: unknown) => void;
  /** "From an image": go and choose one in Media. */
  onPhotoFromImage: () => void;
}

const TILE =
  "flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-left transition hover:border-sky-500 hover:bg-sky-500/5 focus-visible:outline-2 focus-visible:outline-sky-400";

function Heading({ icon, title, hint }: { icon: string; title: string; hint: string }) {
  return (
    <div className="mb-2.5 flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-sky-500/10 text-sky-500">
        <Icon name={icon} />
      </span>
      <div>
        <h3 className="text-sm font-semibold leading-tight">{title}</h3>
        <p className="text-xs text-neutral-500">{hint}</p>
      </div>
    </div>
  );
}

/** "New project": a video in a shape, a photo, or a template. */
export function NewProjectDialog({ open, onClose, run, onPhotoFromImage }: NewProjectDialogProps) {
  const pick = (actionId: string, args?: unknown) => {
    onClose();
    run(actionId, args);
  };
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content
          data-testid="new-project-dialog"
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(94vw,44rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl"
        >
          <div className="mb-5 flex items-start gap-4">
            <div className="flex-1">
              <Dialog.Title className="text-lg font-semibold tracking-tight">
                New project
              </Dialog.Title>
              <Dialog.Description className="text-sm text-neutral-500">
                Choose what you want to make. You can change the size later.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                title="Close (Esc)"
                className="grid h-8 w-8 place-items-center rounded-lg text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100"
              >
                <Icon name="cancel" />
              </button>
            </Dialog.Close>
          </div>

          <section aria-label="Video" className="mb-6">
            <Heading icon="video" title="Video" hint="An empty timeline in the shape you need." />
            <div className="grid gap-2.5 sm:grid-cols-2">
              {SHAPES.map((s) => (
                <button
                  key={s.aspect}
                  type="button"
                  aria-label={`New ${s.label} video, ${s.aspect}, ${s.hint}`}
                  onClick={() => {
                    pick("project.newVideo", { aspect: s.aspect });
                  }}
                  className={`${TILE} text-neutral-400 hover:text-sky-400`}
                >
                  <ShapeGlyph aspect={s.aspect} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-neutral-100">
                      {s.label} <span className="font-normal text-neutral-500">· {s.aspect}</span>
                    </span>
                    <span className="block truncate text-xs text-neutral-500">
                      {s.hint} · {s.use}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section aria-label="Photo" className="mb-6">
            <Heading icon="image" title="Photo" hint="Layers, retouching and graphics." />
            <div className="grid gap-2.5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  pick("project.newPhoto", {});
                }}
                className={`${TILE} text-neutral-400 hover:text-sky-400`}
              >
                <ShapeGlyph aspect="1:1" />
                <span>
                  <span className="block text-sm font-semibold text-neutral-100">Blank canvas</span>
                  <span className="block text-xs text-neutral-500">2048 × 2048, transparent</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onPhotoFromImage();
                }}
                className={`${TILE} text-neutral-400 hover:text-sky-400`}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center">
                  <Icon name="upload" className="h-6 w-6" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-neutral-100">
                    From one of your images
                  </span>
                  <span className="block text-xs text-neutral-500">
                    Pick an image in Media, then Edit photo
                  </span>
                </span>
              </button>
            </div>
          </section>

          <section aria-label="Template">
            <Heading
              icon="template"
              title="Template"
              hint="Reels, intros, lower thirds, slideshows and quote cards."
            />
            <button
              type="button"
              onClick={() => {
                pick("home.showTemplates");
              }}
              className={`${TILE} w-full text-neutral-400 hover:text-sky-400`}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center">
                <Icon name="effect" className="h-6 w-6" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold text-neutral-100">
                  Browse templates
                </span>
                <span className="block text-xs text-neutral-500">
                  Drop your media and words into a finished design
                </span>
              </span>
              <Icon name="arrowRight" />
            </button>
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
