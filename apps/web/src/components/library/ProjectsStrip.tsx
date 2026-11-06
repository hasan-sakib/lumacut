import { useEffect, useState } from "react";
import { Link } from "react-router";
import { listProjects, type ProjectSummary } from "../../api/projects.ts";

/** The user's projects, most recently saved first, as links into the editor. */
export function ProjectsStrip() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listProjects().then(
      (items) => {
        if (active) setProjects(items);
      },
      (e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : "Couldn't load your projects.");
      },
    );
    return () => {
      active = false;
    };
  }, []);

  if (error !== null) return <p className="mb-4 text-sm text-red-300">{error}</p>;
  if (projects === null || projects.length === 0) return null;
  return (
    <section aria-label="Projects" className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-neutral-300">Projects</h2>
      <ul className="flex flex-wrap gap-2" data-testid="projects">
        {projects.map((p) => (
          <li key={p.id}>
            <Link
              to={`/project/${p.id}`}
              className="block rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm hover:border-sky-600"
            >
              <span className="block font-medium text-neutral-100">{p.name}</span>
              <span className="block text-xs text-neutral-500">
                {p.kind} · saved {new Date(p.updatedAt).toLocaleString()}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
