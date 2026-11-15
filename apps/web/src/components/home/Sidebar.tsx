import { DropdownMenu } from "radix-ui";
import { libraryActions, type HomeSection } from "../../actions/library.ts";
import type { ThemeChoice } from "../../stores/prefs.ts";
import { Icon } from "../Icon.tsx";
import { Logo } from "../Logo.tsx";
import { Tip } from "../Tip.tsx";
import { ThemeSwitch } from "./ThemeSwitch.tsx";

const NAV: { section: HomeSection; action: string }[] = [
  { section: "home", action: "home.showHome" },
  { section: "projects", action: "home.showProjects" },
  { section: "templates", action: "home.showTemplates" },
  { section: "media", action: "home.showMedia" },
];

interface SidebarProps {
  section: HomeSection;
  theme: ThemeChoice;
  email: string | null;
  /** How many of each thing there is, shown beside the nav item. */
  counts: Partial<Record<HomeSection, number>>;
  run: (actionId: string, args?: unknown) => void;
}

/** The start screen's left rail: logo, New project, sections, theme and account. */
export function Sidebar({ section, theme, email, counts, run }: SidebarProps) {
  const create = libraryActions.get("project.new");
  const logout = libraryActions.get("auth.logout");
  return (
    <aside
      aria-label="Main"
      className="flex w-16 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900 lg:w-60"
    >
      <div className="flex h-16 items-center justify-center px-4 lg:justify-start">
        <Logo variant="mark" className="lg:hidden" />
        <Logo className="hidden lg:inline-flex" />
      </div>

      <div className="px-3">
        <Tip title={create.title} description={create.description} shortcut={create.shortcut}>
          <button
            type="button"
            aria-label={create.title}
            data-action={create.id}
            onClick={() => {
              run(create.id);
            }}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-sky-600 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
          >
            <Icon name="plus" />
            <span className="hidden lg:inline">{create.title}</span>
          </button>
        </Tip>
      </div>

      <nav aria-label="Sections" className="mt-5 flex flex-col gap-1 px-3">
        {NAV.map((item) => {
          const action = libraryActions.get(item.action);
          const active = section === item.section;
          const count = counts[item.section];
          return (
            <Tip key={item.section} title={action.title} description={action.description}>
              <button
                type="button"
                aria-label={action.title}
                aria-current={active ? "page" : undefined}
                data-action={action.id}
                onClick={() => {
                  run(action.id);
                }}
                className={`flex h-10 items-center justify-center gap-3 rounded-lg px-3 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-sky-400 lg:justify-start ${
                  active
                    ? "bg-sky-500/15 text-sky-400"
                    : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
                }`}
              >
                <Icon name={action.icon ?? "file"} className="h-[18px] w-[18px] shrink-0" />
                <span className="hidden flex-1 text-left lg:inline">{action.title}</span>
                {count !== undefined && count > 0 && (
                  <span className="hidden rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] font-medium tabular-nums text-neutral-400 lg:inline">
                    {count}
                  </span>
                )}
              </button>
            </Tip>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-3 border-t border-neutral-800 p-3 lg:items-stretch">
        <div className="hidden items-center justify-between lg:flex">
          <span className="text-xs font-medium text-neutral-500">Theme</span>
          <ThemeSwitch
            theme={theme}
            onPick={(t) => {
              run(`theme.${t}`);
            }}
          />
        </div>
        <div className="lg:hidden">
          <ThemeSwitch
            vertical
            theme={theme}
            onPick={(t) => {
              run(`theme.${t}`);
            }}
          />
        </div>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            aria-label="Account menu"
            className="flex items-center gap-2.5 rounded-lg p-1.5 text-left transition hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-linear-to-br from-sky-500 to-indigo-500 text-sm font-semibold text-white">
              {email?.slice(0, 1).toUpperCase() ?? "?"}
            </span>
            <span className="hidden min-w-0 flex-1 lg:block">
              <span className="block truncate text-xs font-medium text-neutral-200">
                {email ?? "Account"}
              </span>
              <span className="block text-[11px] text-neutral-500">Signed in</span>
            </span>
            <Icon name="more" className="hidden h-4 w-4 text-neutral-500 lg:block" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              side="top"
              align="start"
              sideOffset={6}
              className="z-50 min-w-52 rounded-lg border border-neutral-700 bg-neutral-900 p-1 text-sm shadow-xl"
            >
              <DropdownMenu.Label className="truncate px-2 py-1.5 text-xs text-neutral-400">
                {email}
              </DropdownMenu.Label>
              <DropdownMenu.Separator className="my-1 h-px bg-neutral-800" />
              <DropdownMenu.Item
                onSelect={() => {
                  run(logout.id);
                }}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 outline-none data-[highlighted]:bg-neutral-800"
              >
                <Icon name="logout" /> {logout.title}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </aside>
  );
}
