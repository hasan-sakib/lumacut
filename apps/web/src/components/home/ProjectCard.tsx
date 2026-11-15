import { DropdownMenu } from "radix-ui";
import { Link } from "react-router";
import { libraryActions } from "../../actions/library.ts";
import type { ProjectSummary } from "../../api/projects.ts";
import { Icon } from "../Icon.tsx";
import { relativeTime } from "./useProjects.ts";

const KIND: Record<ProjectSummary["kind"], { label: string; icon: string; tint: string }> = {
  video: { label: "Video", icon: "video", tint: "bg-sky-500/10 text-sky-500" },
  motion: { label: "Motion", icon: "effect", tint: "bg-violet-500/10 text-violet-500" },
  photo: { label: "Photo", icon: "image", tint: "bg-emerald-500/10 text-emerald-500" },
};

interface ProjectCardProps {
  project: ProjectSummary;
  now: number;
  run: (actionId: string, args?: unknown) => void;
}

/** One existing project: click to open; the ⋯ menu has Open and Delete. */
export function ProjectCard({ project, now, run }: ProjectCardProps) {
  const kind = KIND[project.kind];
  const open = libraryActions.get("project.open");
  const remove = libraryActions.get("project.delete");
  return (
    <li
      data-testid="project-card"
      className="group relative flex flex-col overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-500/60 hover:shadow-md focus-within:border-sky-500"
    >
      <div className={`grid aspect-video place-items-center ${kind.tint}`}>
        <Icon name={kind.icon} className="h-10 w-10 opacity-80" />
      </div>
      <div className="flex items-start gap-2 p-3">
        <div className="min-w-0 flex-1">
          <Link
            to={`/project/${project.id}`}
            title={`Open “${project.name}”`}
            className="block truncate text-sm font-semibold text-neutral-100 outline-none after:absolute after:inset-0"
          >
            {project.name}
          </Link>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-500">
            <span className="rounded bg-neutral-800 px-1.5 py-0.5 font-medium text-neutral-400">
              {kind.label}
            </span>
            <Icon name="clock" className="h-3 w-3" />
            <span className="truncate">Edited {relativeTime(project.updatedAt, now)}</span>
          </p>
        </div>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            aria-label={`More actions for “${project.name}”`}
            title="More actions"
            className="relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-md text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100 focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <Icon name="more" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={4}
              className="z-50 min-w-40 rounded-lg border border-neutral-700 bg-neutral-900 p-1 text-sm shadow-xl"
            >
              <DropdownMenu.Item
                onSelect={() => {
                  run(open.id, { project: project.id });
                }}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 outline-none data-[highlighted]:bg-neutral-800"
              >
                <Icon name="folder" /> Open
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => {
                  run(remove.id, { project: project.id });
                }}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-red-300 outline-none data-[highlighted]:bg-red-950"
              >
                <Icon name="trash" /> Delete
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </li>
  );
}
