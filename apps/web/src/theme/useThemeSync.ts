import { useEffect } from "react";
import { useLocation } from "react-router";
import { usePrefsStore, type ThemeChoice } from "../stores/prefs.ts";

export type ResolvedTheme = "light" | "dark";

/** The editor and the developer bench are always dark; the theme applies everywhere else. */
function forcedDark(pathname: string): boolean {
  return pathname.startsWith("/project/") || pathname.startsWith("/dev/");
}

export function resolveTheme(choice: ThemeChoice, systemLight: boolean): ResolvedTheme {
  if (choice === "system") return systemLight ? "light" : "dark";
  return choice;
}

/** The theme on screen right now (what `data-theme` on <html> says). */
export function currentTheme(): ResolvedTheme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** Keeps `data-theme` on <html> in step with the preference, the OS setting and the route. */
export function useThemeSync(): void {
  const choice = usePrefsStore((s) => s.theme);
  const { pathname } = useLocation();
  useEffect(() => {
    const media =
      "matchMedia" in window ? window.matchMedia("(prefers-color-scheme: light)") : null;
    const apply = () => {
      document.documentElement.dataset.theme = forcedDark(pathname)
        ? "dark"
        : resolveTheme(choice, media?.matches ?? false);
    };
    apply();
    media?.addEventListener("change", apply);
    return () => {
      media?.removeEventListener("change", apply);
    };
  }, [choice, pathname]);
}
