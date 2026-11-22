import { useLayoutEffect, useState } from "react";
import { usePrefsStore } from "../../stores/prefs.ts";

interface Step {
  /** `data-tour` value of the element to point at (missing: the step is shown centred). */
  target: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    target: "panels",
    title: "Everything is in the side panel",
    body: "Template slots, your media, effects, text and the selected clip's settings. A template opens on its slots: put in your photos and words there.",
  },
  {
    target: "mode",
    title: "Simple or Pro",
    body: "Simple shows big buttons and only the basics. Pro shows every tool. Switching never changes your project (Alt+S).",
  },
  {
    target: "preview",
    title: "Hover to preview",
    body: "In the Effects tab, hover an effect, preset or look to see it in the preview; click to keep it. Looks and effects go on their own layer above the selected clip.",
  },
  {
    target: "palette",
    title: "Find anything",
    body: "Press ⌘K / Ctrl+K and type what you want: “slow motion”, “blur”, “add captions”. Every command lives there.",
  },
  {
    target: "export",
    title: "Export",
    body: "Save MP4, GIF, audio or images. Short videos are made in your browser; long ones on the server.",
  },
];

/**
 * The first-run guided tour: five short steps with a spotlight on the part they talk about.
 * Shown once per browser; "Show the tour" (help.tour) replays it.
 */
export function Tour() {
  const done = usePrefsStore((s) => s.onboarding.tourDone);
  const finish = usePrefsStore((s) => s.finishTour);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = STEPS[index];

  useLayoutEffect(() => {
    if (done || step === undefined) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    const update = () => {
      setRect(el?.getBoundingClientRect() ?? null);
    };
    update();
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
    };
  }, [done, step]);

  if (done || step === undefined) return null;
  const pad = 6;
  const card =
    rect === null
      ? { left: "50%", top: "40%", transform: "translate(-50%, -50%)" }
      : {
          left: Math.min(window.innerWidth - 340, Math.max(12, rect.left)),
          top:
            rect.bottom + 12 + 180 > window.innerHeight
              ? Math.max(12, rect.top - 190)
              : rect.bottom + 12,
        };
  const close = () => {
    setIndex(0);
    finish();
  };
  return (
    <div role="dialog" aria-modal="true" aria-label="Tour" className="fixed inset-0 z-[60]">
      {rect !== null ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-lg ring-2 ring-sky-400"
          style={{
            left: rect.left - pad,
            top: rect.top - pad,
            width: rect.width + 2 * pad,
            height: rect.height + 2 * pad,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.6)",
          }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-black/60" />
      )}
      <div
        className="absolute w-80 rounded-xl border border-neutral-700 bg-neutral-900 p-4 text-sm shadow-2xl"
        style={card}
      >
        <p className="text-xs text-neutral-500">
          {index + 1} of {STEPS.length}
        </p>
        <h2 className="mt-1 font-semibold text-neutral-100">{step.title}</h2>
        <p className="mt-1 text-neutral-300">{step.body}</p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={close}
            className="text-xs text-neutral-400 hover:text-neutral-200"
          >
            Skip tour
          </button>
          <span className="flex-1" />
          {index > 0 && (
            <button
              type="button"
              onClick={() => {
                setIndex(index - 1);
              }}
              className="rounded bg-neutral-800 px-3 py-1 hover:bg-neutral-700"
            >
              Back
            </button>
          )}
          <button
            type="button"
            autoFocus
            onClick={() => {
              if (index + 1 >= STEPS.length) close();
              else setIndex(index + 1);
            }}
            className="rounded bg-sky-600 px-3 py-1 text-white hover:bg-sky-500"
          >
            {index + 1 >= STEPS.length ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
