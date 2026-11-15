import type { ReactNode } from "react";
import type { ProjectSummary } from "../../api/projects.ts";
import { Icon } from "../Icon.tsx";
import { Checklist } from "../onboarding/Checklist.tsx";
import { ProjectCard } from "./ProjectCard.tsx";
import { PROJECT_GRID } from "./ProjectsView.tsx";
import { SHAPES, ShapeGlyph } from "./shapes.tsx";

const RECENT = 8;

interface HomeViewProps {
  projects: ProjectSummary[] | null;
  projectsError: string | null;
  now: number;
  run: (actionId: string, args?: unknown) => void;
  /** The featured templates row (the gallery, limited). */
  templates: ReactNode;
}

function SectionHeading({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end gap-3">
      <div className="flex-1">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {hint !== undefined && <p className="text-xs text-neutral-500">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

function ViewAll({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-sky-400 hover:bg-sky-500/10"
    >
      {label} <Icon name="arrowRight" className="h-3.5 w-3.5" />
    </button>
  );
}

const QUICK =
  "group flex flex-col items-start gap-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-left text-neutral-400 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-500 hover:text-sky-400 hover:shadow-md focus-visible:outline-2 focus-visible:outline-sky-400";

/** The start screen's Home: start something new, recent projects, getting started, templates. */
export function HomeView({ projects, projectsError, now, run, templates }: HomeViewProps) {
  const recent = (projects ?? []).slice(0, RECENT);
  return (
    <div className="flex flex-col gap-10">
      <section aria-label="Start something new">
        <SectionHeading title="Start something new" hint="Pick a shape, a photo or a template." />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {SHAPES.map((s) => (
            <button
              key={s.aspect}
              type="button"
              title={`New ${s.aspect} video (${s.hint})`}
              aria-label={`New ${s.label} video, ${s.aspect}`}
              onClick={() => {
                run("project.newVideo", { aspect: s.aspect });
              }}
              className={QUICK}
            >
              <ShapeGlyph aspect={s.aspect} />
              <span>
                <span className="block text-sm font-semibold text-neutral-100">{s.label}</span>
                <span className="block text-xs text-neutral-500">
                  {s.aspect} · {s.hint}
                </span>
              </span>
            </button>
          ))}
          <button
            type="button"
            title="New photo: a blank 2048 × 2048 canvas"
            aria-label="New photo"
            onClick={() => {
              run("project.newPhoto", {});
            }}
            className={QUICK}
          >
            <span className="grid h-10 w-10 place-items-center">
              <Icon name="image" className="h-8 w-8" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-neutral-100">Photo</span>
              <span className="block text-xs text-neutral-500">Blank canvas</span>
            </span>
          </button>
          <button
            type="button"
            title="Start from a template"
            aria-label="Browse templates"
            onClick={() => {
              run("home.showTemplates");
            }}
            className={QUICK}
          >
            <span className="grid h-10 w-10 place-items-center">
              <Icon name="template" className="h-8 w-8" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-neutral-100">Template</span>
              <span className="block text-xs text-neutral-500">20 ready designs</span>
            </span>
          </button>
        </div>
      </section>

      <Checklist />

      <section aria-label="Recent projects">
        <SectionHeading
          title="Recent projects"
          hint="Pick up where you left off."
          action={
            projects !== null && projects.length > 0 ? (
              <ViewAll
                label={`All projects (${String(projects.length)})`}
                onClick={() => {
                  run("home.showProjects");
                }}
              />
            ) : undefined
          }
        />
        {projectsError !== null ? (
          <p role="alert" className="text-sm text-red-300">
            {projectsError}
          </p>
        ) : projects === null ? (
          <p className="text-sm text-neutral-500">Loading your projects…</p>
        ) : recent.length === 0 ? (
          <div className="flex items-center gap-4 rounded-xl border border-dashed border-neutral-700 p-6">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sky-500/10 text-sky-500">
              <Icon name="folder" className="h-5 w-5" />
            </span>
            <p className="text-sm text-neutral-400">
              You have no projects yet. Start one above and it will appear here.
            </p>
          </div>
        ) : (
          <ul className={PROJECT_GRID} data-testid="projects">
            {recent.map((p) => (
              <ProjectCard key={p.id} project={p} now={now} run={run} />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Featured templates">
        <SectionHeading
          title="Templates"
          hint="Drop your media and words into a finished design."
          action={
            <ViewAll
              label="All templates"
              onClick={() => {
                run("home.showTemplates");
              }}
            />
          }
        />
        {templates}
      </section>
    </div>
  );
}
