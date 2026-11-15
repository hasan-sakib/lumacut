import { editingActions, type EditingContext } from "../../actions/editing.ts";
import type { AnyAction } from "@lumacut/actions";
import { Tip } from "../Tip.tsx";

/** Simple | Pro: the same project, two layouts. */
export function ModeSwitch({
  ctx,
  onRun,
}: {
  ctx: EditingContext;
  onRun: (action: AnyAction<EditingContext>) => void;
}) {
  const mode = ctx.mode ?? "pro";
  return (
    <div
      role="radiogroup"
      aria-label="Editor mode"
      className="flex rounded-full bg-neutral-900 p-0.5 text-xs"
    >
      {(["simple", "pro"] as const).map((m) => {
        const action = editingActions.get(m === "simple" ? "mode.simple" : "mode.pro");
        return (
          <Tip
            key={m}
            title={action.title}
            description={action.description}
            shortcut={editingActions.get("mode.toggle").shortcut}
          >
            <button
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => {
                if (mode !== m) onRun(action);
              }}
              className={`rounded-full px-3 py-1 ${mode === m ? "bg-sky-600 text-white" : "text-neutral-300 hover:text-white"}`}
            >
              {m === "simple" ? "Simple" : "Pro"}
            </button>
          </Tip>
        );
      })}
    </div>
  );
}
