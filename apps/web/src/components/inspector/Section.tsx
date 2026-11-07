import type { ReactNode } from "react";

interface SectionProps {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  hasAdvanced: boolean;
  hiddenAdvanced: number;
  advanced: boolean;
  onToggleAdvanced: () => void;
  /** A search is running: sections stay open and the advanced switch is irrelevant. */
  searching: boolean;
  children: ReactNode;
}

/** A collapsible group of fields with its own Basic/Advanced switch. */
export function Section({
  id,
  title,
  open,
  onToggle,
  hasAdvanced,
  hiddenAdvanced,
  advanced,
  onToggleAdvanced,
  searching,
  children,
}: SectionProps) {
  const expanded = open || searching;
  return (
    <section aria-label={title} data-section={id} className="border-b border-neutral-800 py-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex flex-1 items-center gap-1 text-left text-sm font-semibold text-neutral-100"
        >
          <span aria-hidden="true" className="inline-block w-3 text-neutral-500">
            {expanded ? "▾" : "▸"}
          </span>
          {title}
        </button>
        {hasAdvanced && !searching && (
          <button
            type="button"
            onClick={onToggleAdvanced}
            aria-pressed={advanced}
            className="rounded px-1.5 py-0.5 text-xs text-sky-300 hover:bg-neutral-800"
          >
            {advanced
              ? "Basic"
              : `Advanced${hiddenAdvanced > 0 ? ` (${String(hiddenAdvanced)})` : ""}`}
          </button>
        )}
      </div>
      {expanded && <div className="mt-2 flex flex-col gap-2 pl-4">{children}</div>}
    </section>
  );
}
