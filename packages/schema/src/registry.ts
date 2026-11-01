import * as z from "zod";

export interface SchemaMeta {
  id: string;
  description?: string;
}

/**
 * Every schema registered here becomes a named `$defs` entry in the exported JSON Schema and,
 * through codegen, a named Pydantic model or type alias. Registration order is the output order.
 */
export const schemaRegistry = z.registry<SchemaMeta>();

const ids: string[] = [];

/** Ids of every named schema, in registration order. */
export const registeredSchemaIds: readonly string[] = ids;

export function named<T extends z.ZodType>(id: string, schema: T, description?: string): T {
  if (ids.includes(id)) throw new Error(`Duplicate schema id: ${id}`);
  ids.push(id);
  schemaRegistry.add(schema, description === undefined ? { id } : { id, description });
  return schema;
}
