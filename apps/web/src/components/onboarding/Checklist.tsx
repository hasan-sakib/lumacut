import { usePrefsStore } from "../../stores/prefs.ts";

const ITEMS: { step: string; label: string; hint: string }[] = [
  { step: "template", label: "Start from a template", hint: "Pick one under Create." },
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
      className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 text-sm"
    >
      <div className="mb-2 flex items-center gap-2">
        <h2 className="font-semibold">Getting started</h2>
        <span className="text-xs text-neutral-500">
          {done} of {ITEMS.length}
        </span>
        <button
          type="button"
          title="Hide this checklist"
          onClick={() => {
            complete("dismissed");
          }}
          className="ml-auto text-xs text-neutral-400 hover:text-neutral-200"
        >
          Hide
        </button>
      </div>
      <ul className="grid gap-1 sm:grid-cols-2">
        {ITEMS.map((i) => {
          const ok = steps[i.step] === true;
          return (
            <li key={i.step} className="flex items-start gap-2">
              <span aria-hidden className={ok ? "text-emerald-400" : "text-neutral-600"}>
                {ok ? "✔" : "○"}
              </span>
              <span>
                <span className={ok ? "text-neutral-400 line-through" : "text-neutral-100"}>
                  {i.label}
                </span>
                {!ok && <span className="block text-xs text-neutral-500">{i.hint}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
