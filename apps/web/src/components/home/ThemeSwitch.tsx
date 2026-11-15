import type { ThemeChoice } from "../../stores/prefs.ts";
import { Icon } from "../Icon.tsx";
import { Tip } from "../Tip.tsx";

const OPTIONS: { theme: ThemeChoice; label: string; hint: string; icon: string }[] = [
  { theme: "light", label: "Light", hint: "Use the light appearance.", icon: "sun" },
  { theme: "dark", label: "Dark", hint: "Use the dark appearance.", icon: "moon" },
  { theme: "system", label: "System", hint: "Follow your device's setting.", icon: "monitor" },
];

interface ThemeSwitchProps {
  theme: ThemeChoice;
  onPick: (theme: ThemeChoice) => void;
  /** Stack the three buttons (for the narrow sidebar rail). */
  vertical?: boolean;
}

/** Light / Dark / System, as one segmented control. */
export function ThemeSwitch({ theme, onPick, vertical = false }: ThemeSwitchProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={`inline-flex gap-0.5 rounded-lg border border-neutral-800 bg-neutral-950 p-0.5 ${vertical ? "flex-col" : ""}`}
    >
      {OPTIONS.map((o) => (
        <Tip key={o.theme} title={`${o.label} theme`} description={o.hint}>
          <button
            type="button"
            role="radio"
            aria-checked={theme === o.theme}
            aria-label={`${o.label} theme`}
            onClick={() => {
              onPick(o.theme);
            }}
            className={`grid h-7 w-8 place-items-center rounded-md transition focus-visible:outline-2 focus-visible:outline-sky-400 ${
              theme === o.theme
                ? "bg-neutral-900 text-sky-400 shadow-sm ring-1 ring-neutral-700"
                : "text-neutral-500 hover:text-neutral-200"
            }`}
          >
            <Icon name={o.icon} />
          </button>
        </Tip>
      ))}
    </div>
  );
}
