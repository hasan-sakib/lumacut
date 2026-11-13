import type { ExportSettings } from "@lumacut/engine";
import { api, errorMessage } from "../api/client.ts";
import type { components } from "../api/generated/schema";

export type ServerExport = components["schemas"]["ExportOut"];

/** Asks the server to export a composition; the project is copied as it is saved right now. */
export async function createServerExport(
  projectId: string,
  compositionId: string,
  settings: ExportSettings,
  name?: string,
): Promise<ServerExport> {
  const { data, error } = await api.POST("/api/exports", {
    body: { projectId, compositionId, settings, ...(name === undefined ? {} : { name }) },
  });
  if (data === undefined) throw new Error(errorMessage(error, "Couldn't start the export."));
  return data;
}

export async function listServerExports(projectId: string): Promise<ServerExport[]> {
  const { data, error } = await api.GET("/api/exports", { params: { query: { projectId } } });
  if (data === undefined) throw new Error(errorMessage(error, "Couldn't load the exports."));
  return data.items;
}

export async function getServerExport(id: string): Promise<ServerExport> {
  const { data, error } = await api.GET("/api/exports/{export_id}", {
    params: { path: { export_id: id } },
  });
  if (data === undefined) throw new Error(errorMessage(error, "Couldn't load the export."));
  return data;
}

export async function cancelServerExport(id: string): Promise<void> {
  const { data, error } = await api.POST("/api/exports/{export_id}/cancel", {
    params: { path: { export_id: id } },
  });
  if (data === undefined) throw new Error(errorMessage(error, "Couldn't cancel the export."));
}

export async function deleteServerExport(id: string): Promise<void> {
  const { error, response } = await api.DELETE("/api/exports/{export_id}", {
    params: { path: { export_id: id } },
  });
  if (!response.ok) throw new Error(errorMessage(error, "Couldn't remove the export."));
}
