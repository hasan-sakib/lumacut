import type { ReactNode, Ref } from "react";
import { Icon } from "../Icon.tsx";

interface TopBarProps {
  title: string;
  subtitle: string;
  search: string;
  /** The search box's label; `null` hides the search box. */
  searchLabel: string | null;
  searchRef: Ref<HTMLInputElement>;
  onSearch: (value: string) => void;
  /** Section-specific buttons, right-aligned. */
  children?: ReactNode;
}

/** The start screen's header: where you are, search, and the section's main buttons. */
export function TopBar({
  title,
  subtitle,
  search,
  searchLabel,
  searchRef,
  onSearch,
  children,
}: TopBarProps) {
  return (
    <header className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-800 bg-neutral-900/80 px-6 py-2.5 backdrop-blur lg:px-8">
      <div className="mr-auto min-w-0">
        <h1 className="truncate text-lg font-semibold leading-tight tracking-tight">{title}</h1>
        <p className="truncate text-xs text-neutral-500">{subtitle}</p>
      </div>
      {searchLabel !== null && (
        <div className="relative w-full max-w-xs sm:w-72">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500"
          />
          <input
            ref={searchRef}
            type="search"
            value={search}
            aria-label={searchLabel}
            placeholder={`${searchLabel}…`}
            onChange={(e) => {
              onSearch(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") e.currentTarget.blur();
            }}
            className="h-9 w-full rounded-lg border border-neutral-800 bg-neutral-950 pl-9 pr-9 text-sm outline-none transition placeholder:text-neutral-500 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
          />
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-neutral-700 px-1.5 font-mono text-[10px] text-neutral-500"
          >
            /
          </kbd>
        </div>
      )}
      {children !== undefined && <div className="flex items-center gap-2">{children}</div>}
    </header>
  );
}
