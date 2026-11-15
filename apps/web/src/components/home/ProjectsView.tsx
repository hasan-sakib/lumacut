import { useMemo, useState } from "react";
import type { ProjectSummary } from "../../api/projects.ts";
import { Icon } from "../Icon.tsx";
import { ProjectCard } from "./ProjectCard.tsx";

export const PROJECT_GRID = "grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-4";

type Sort = "recent" | "name";
type Kind = ProjectSummary["kind"] | "all";

const KINDS: { kind: Kind; label: string }[] = [
  { kind: "all", label: "All" },
  { kind: "video", label: "Video" },
  { kind: "photo", label: "Photo" },
  { kind: "motion", label: "Motion" },
];

interface ProjectsViewProps {
  projects: ProjectSummary[] | null;
  error: string | null;
  now: number;
  query: string;
  run: (actionId: string, args?: unknown) => void;
}

/** Every existing project as a card grid, filtered by the search box and kind, sortable. */
export function ProjectsView({ projects, error, now, query, run }: ProjectsViewProps) {
  const [sort, setSort] = useState<Sort>("recent");
  const [kind, setKind] = useState<Kind>("all");
  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const list = (projects ?? []).filter(
      (p) =>
        (kind === "all" || p.kind === kind) && words.every((w) => p.name.toLowerCase().includes(w)),
    );
    if (sort === "name") return [...list].sort((a, b) => a.name.localeCompare(b.name));
    return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [projects, query, sort, kind]);

  if (error !== null) {
    return (
      <p role="alert" className="rounded-xl border border-red-800 bg-red-950/40 p-4 text-sm">
        {error}
      </p>
    );
  }
  if (projects === null) return <p className="text-sm text-neutral-500">Loading your projects…</p>;
  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-700 px-6 py-16 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-sky-500/10 text-sky-500">
          <Icon name="folder" className="h-7 w-7" />
        </span>
        <p className="text-base font-semibold">No projects yet</p>
        <p className="max-w-sm text-sm text-neutral-500">
          Start a video, a photo, or pick a template. Everything you make shows up here.
        </p>
        <button
          type="button"
          onClick={() => {
            run("project.new");
          }}
          className="mt-2 inline-flex h-9 items-center gap-2 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-500"
        >
          <Icon name="plus" /> New project
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Project kind" className="flex gap-1">
          {KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              role="tab"
              aria-selected={kind === k.kind}
              onClick={() => {
                setKind(k.kind);
              }}
              className={`h-8 rounded-full px-3.5 text-xs font-medium transition ${
                kind === k.kind
                  ? "bg-sky-600 text-white"
                  : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-neutral-500">
          {shown.length} of {projects.length}
        </span>
        <label className="ml-auto flex items-center gap-2 text-xs text-neutral-500">
          <Icon name="sort" className="h-3.5 w-3.5" />
          <span className="sr-only">Sort projects</span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value === "name" ? "name" : "recent");
            }}
            className="h-8 rounded-lg border border-neutral-800 bg-neutral-900 px-2 text-xs text-neutral-200 outline-none focus:border-sky-500"
          >
            <option value="recent">Last edited</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>
      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-700 p-10 text-center text-sm text-neutral-500">
          No project matches{query.trim() ? ` “${query.trim()}”` : " this filter"}.
        </p>
      ) : (
        <ul className={PROJECT_GRID} data-testid="projects">
          {shown.map((p) => (
            <ProjectCard key={p.id} project={p} now={now} run={run} />
          ))}
        </ul>
      )}
    </div>
  );
}
