import type { Project } from "@lumacut/schema";
import { api, errorMessage } from "./client.ts";
import type { components } from "./generated/schema";

export type SavedTemplate = components["schemas"]["TemplateOut"];
export type TemplateCategoryApi = components["schemas"]["TemplateCreate"]["category"];

/** Templates this user saved (the built-in ones ship with the app). */
export async function listSavedTemplates(): Promise<SavedTemplate[]> {
  const { data, error } = await api.GET("/api/templates");
  if (data === undefined) throw new Error(errorMessage(error, "Couldn't load your templates."));
  return data.items;
}

export async function saveTemplate(
  name: string,
  category: NonNullable<TemplateCategoryApi>,
  description: string,
  doc: Project,
): Promise<SavedTemplate> {
  const { data, error } = await api.POST("/api/templates", {
    body: { name, category, description, doc },
  });
  if (data === undefined) throw new Error(errorMessage(error, "Couldn't save the template."));
  return data;
}

export async function deleteSavedTemplate(id: string): Promise<void> {
  const { error, response } = await api.DELETE("/api/templates/{template_id}", {
    params: { path: { template_id: id } },
  });
  if (!response.ok) throw new Error(errorMessage(error, "Couldn't remove the template."));
}
