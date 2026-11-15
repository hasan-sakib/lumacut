import { useCallback, useEffect, useState } from "react";
import { deleteProject, listProjects, type ProjectSummary } from "../../api/projects.ts";

interface ProjectsState {
  /** `null` while the first load is in flight. */
  projects: ProjectSummary[] | null;
  error: string | null;
  /** When the list was loaded (ms), for "edited 2 hours ago". */
  loadedAt: number;
  /** Delete on the server, then drop it from the list. Resolves to an error message or null. */
  remove: (id: string) => Promise<string | null>;
}

/** The signed-in user's projects, most recently saved first. */
export function useProjects(): ProjectsState {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);

  useEffect(() => {
    let active = true;
    listProjects().then(
      (items) => {
        if (!active) return;
        setLoadedAt(Date.now());
        setProjects(items);
      },
      (e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : "Couldn't load your projects.");
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const remove = useCallback(async (id: string) => {
    try {
      await deleteProject(id);
      setProjects((list) => list?.filter((p) => p.id !== id) ?? null);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Couldn't delete the project.";
    }
  }, []);

  return { projects, error, loadedAt, remove };
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["week", 604_800_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "2 hours ago", "yesterday", "just now". */
export function relativeTime(iso: string, now: number): string {
  const elapsed = now - new Date(iso).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 60_000) return "just now";
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, ms] of UNITS) {
    if (elapsed >= ms) return format.format(-Math.floor(elapsed / ms), unit);
  }
  return "just now";
}
