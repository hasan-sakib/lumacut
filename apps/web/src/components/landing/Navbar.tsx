import { useState } from "react";
import { Link } from "react-router";
import { usePrefsStore } from "../../stores/prefs.ts";
import { ThemeSwitch } from "../home/ThemeSwitch.tsx";
import { Icon } from "../Icon.tsx";
import { Logo } from "../Logo.tsx";
import { SECTIONS } from "./content.ts";
import { useActiveSection, useScrolled } from "./useActiveSection.ts";

const IDS = SECTIONS.map((s) => s.id);

/** The landing page's top bar: logo, section links, theme, log in and sign up. */
export function Navbar() {
  const [open, setOpen] = useState(false);
  const scrolled = useScrolled();
  const active = useActiveSection(IDS);
  const theme = usePrefsStore((s) => s.theme);
  const setTheme = usePrefsStore((s) => s.setTheme);
  return (
    <header
      className={`sticky top-0 z-40 border-b backdrop-blur-md transition-colors ${
        scrolled || open
          ? "border-neutral-800 bg-neutral-950/85"
          : "border-transparent bg-neutral-950/0"
      }`}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-sky-600 focus:px-3 focus:py-1.5 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-5 lg:px-8">
        <a href="#top" aria-label="Lumacut, back to top" className="shrink-0">
          <Logo />
        </a>
        <nav aria-label="Sections" className="hidden flex-1 items-center gap-1 lg:flex">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              aria-current={active === s.id ? "true" : undefined}
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                active === s.id
                  ? "bg-sky-500/10 text-sky-400"
                  : "text-neutral-400 hover:text-neutral-100"
              }`}
            >
              {s.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:block">
            <ThemeSwitch theme={theme} onPick={setTheme} />
          </div>
          <Link
            to="/login"
            className="hidden h-9 items-center rounded-lg px-3 text-sm font-medium text-neutral-200 hover:bg-neutral-800 sm:inline-flex"
          >
            Log in
          </Link>
          <Link
            to="/register"
            className="inline-flex h-9 items-center rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
          >
            Get started
          </Link>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="landing-menu"
            onClick={() => {
              setOpen((v) => !v);
            }}
            className="grid h-9 w-9 place-items-center rounded-lg text-neutral-200 hover:bg-neutral-800 lg:hidden"
          >
            <Icon name={open ? "cancel" : "menu"} className="h-5 w-5" />
          </button>
        </div>
      </div>
      {open && (
        <div id="landing-menu" className="border-t border-neutral-800 px-5 pb-5 pt-3 lg:hidden">
          <nav aria-label="Sections" className="flex flex-col">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={() => {
                  setOpen(false);
                }}
                className="rounded-md px-2 py-2.5 text-base font-medium text-neutral-200 hover:bg-neutral-800"
              >
                {s.label}
              </a>
            ))}
          </nav>
          <div className="mt-3 flex items-center justify-between border-t border-neutral-800 pt-4">
            <Link to="/login" className="text-sm font-medium text-sky-400">
              Log in
            </Link>
            <ThemeSwitch theme={theme} onPick={setTheme} />
          </div>
        </div>
      )}
    </header>
  );
}
