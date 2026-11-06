import { Project } from "@lumacut/schema";
import { api, errorMessage } from "./client.ts";
import type { components } from "./generated/schema";

export type ProjectSummary = components["schemas"]["ProjectSummary"];
export type ProjectKind = ProjectSummary["kind"];
export type SnapshotOut = components["schemas"]["SnapshotOut"];

export interface LoadedProject {
  project: Project;
  version: number;
}

/** How a save ended. Conflicts and failures are values, not exceptions: the store reacts to each. */
export type SaveOutcome =
  | { kind: "saved"; version: number }
  | { kind: "conflict"; currentVersion: number }
  | { kind: "failed"; message: string; retryable: boolean };

/** What the project store needs from the server (replaced by a fake in tests). */
export interface ProjectClient {
  load(id: string): Promise<LoadedProject>;
  save(id: string, version: number, doc: Project): Promise<SaveOutcome>;
}

export class ProjectLoadError extends Error {
  override name = "ProjectLoadError";
}

export const projectClient: ProjectClient = {
  async load(id) {
    const { data, error } = await api.GET("/api/projects/{project_id}", {
      params: { path: { project_id: id } },
    });
    if (data === undefined) throw new ProjectLoadError(errorMessage(error, "Couldn't open this project."));
    const parsed = Project.safeParse(data.doc);
    if (!parsed.success) {
      throw new ProjectLoadError("This project's file isn't in a format this version understands.");
    }
    return { project: parsed.data, version: data.version };
  },

  async save(id, version, doc) {
    try {
      const { data, error, response } = await api.PUT("/api/projects/{project_id}", {
        params: { path: { project_id: id }, header: { "if-match": String(version) } },
        body: { doc },
      });
      if (data !== undefined) return { kind: "saved", version: data.version };
      if (response.status === 412) {
        const current = Number(response.headers.get("etag"));
        return { kind: "conflict", currentVersion: Number.isFinite(current) ? current : version };
      }
      return {
        kind: "failed",
        message: errorMessage(error, "Couldn't save the project."),
        retryable: response.status >= 500 || response.status === 429,
      };
    } catch {
      return { kind: "failed", message: "You appear to be offline. Changes will save when you're back.", retryable: true };
    }
  },
};

export async function listProjects(): Promise<ProjectSummary[]> {
  const { data, error } = await api.GET("/api/projects");
  if (data === undefined) throw new Error(errorMessage(error, "Couldn't load your projects."));
  return data.items;
}

export async function createProject(name: string, kind: ProjectKind = "video"): Promise<string> {
  const { data, error } = await api.POST("/api/projects", { body: { name, kind } });
  if (data === undefined) throw new Error(errorMessage(error, "Couldn't create the project."));
  return data.id;
}

export async function deleteProject(id: string): Promise<void> {
  const { error, response } = await api.DELETE("/api/projects/{project_id}", {
    params: { path: { project_id: id } },
  });
  if (!response.ok) throw new Error(errorMessage(error, "Couldn't delete the project."));
}
