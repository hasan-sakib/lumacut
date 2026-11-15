import { usePrefsStore } from "../../stores/prefs.ts";
import { Icon } from "../Icon.tsx";

const ITEMS: { step: string; label: string; hint: string }[] = [
  { step: "template", label: "Start from a template", hint: "Pick one under Templates." },
  {
    step: "replace",
    label: "Put your media in a slot",
    hint: "Template tab → choose a photo or video.",
  },
  { step: "captions", label: "Add captions", hint: "Text tab → paste your words." },
  { step: "export", label: "Export your video", hint: "Export (⇧⌘E) → MP4." },
];

/** "Getting started": ticks itself as you do each thing; hide it when you're done with it. */
export function Checklist() {
  const steps = usePrefsStore((s) => s.onboarding.steps);
  const complete = usePrefsStore((s) => s.completeStep);
  if (steps.dismissed === true) return null;
  const done = ITEMS.filter((i) => steps[i.step] === true).length;
  return (
    <section
      aria-label="Getting started"
      className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-sm"
    >
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-sky-500/10 text-sky-500">
          <Icon name="effect" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Getting started</h2>
          <div className="mt-1.5 flex items-center gap-2">
            <div
              role="progressbar"
              aria-label="Getting started progress"
              aria-valuemin={0}
              aria-valuemax={ITEMS.length}
              aria-valuenow={done}
              className="h-1.5 w-40 max-w-full overflow-hidden rounded-full bg-neutral-800"
            >
              <div
                className="h-full rounded-full bg-sky-500 transition-all"
                style={{ width: `${String((done / ITEMS.length) * 100)}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-neutral-500">
              {done} of {ITEMS.length}
            </span>
          </div>
        </div>
        <button
          type="button"
          title="Hide this checklist"
          onClick={() => {
            complete("dismissed");
          }}
          className="rounded-md px-2 py-1 text-xs font-medium text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
        >
          Hide
        </button>
      </div>
      <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
        {ITEMS.map((i) => {
          const ok = steps[i.step] === true;
          return (
            <li key={i.step} className="flex items-start gap-2.5 text-sm">
              <span
                aria-hidden
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                  ok ? "bg-emerald-500 text-white" : "border border-neutral-700 text-transparent"
                }`}
              >
                <Icon name="check" className="h-3 w-3" />
              </span>
              <span>
                <span
                  className={ok ? "text-neutral-500 line-through" : "font-medium text-neutral-100"}
                >
                  {i.label}
                </span>
                <span className="sr-only">{ok ? " (done)" : " (to do)"}</span>
                {!ok && <span className="block text-xs text-neutral-500">{i.hint}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
