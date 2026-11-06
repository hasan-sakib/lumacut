import * as z from "zod";

/** One input of a flat argument form (what the palette asks for before running an action). */
export interface ArgField {
  name: string;
  kind: "string" | "number" | "integer" | "boolean" | "enum";
  optional: boolean;
  description?: string;
  options?: string[];
  min?: number;
  max?: number;
}

interface JsonProperty {
  type?: string;
  enum?: unknown[];
  description?: string;
  minimum?: number;
  maximum?: number;
}

/**
 * The fields of an action's `argsSchema` when it is a flat object of strings, numbers, booleans
 * and enums, so a form can be generated; null for anything richer (the caller then offers only
 * actions without arguments, or a JSON box).
 */
export function describeArgs(schema: z.ZodType): ArgField[] | null {
  let json: { type?: string; properties?: Record<string, JsonProperty>; required?: string[] };
  try {
    json = z.toJSONSchema(schema) as typeof json;
  } catch {
    return null;
  }
  if (json.type !== "object" || json.properties === undefined) return null;
  const required = new Set(json.required ?? []);
  const fields: ArgField[] = [];
  for (const [name, prop] of Object.entries(json.properties)) {
    let field: ArgField;
    if (prop.enum !== undefined && prop.enum.every((o) => typeof o === "string")) {
      field = { name, kind: "enum", optional: !required.has(name), options: prop.enum as string[] };
    } else if (prop.type === "string" || prop.type === "number" || prop.type === "integer" || prop.type === "boolean") {
      field = { name, kind: prop.type, optional: !required.has(name) };
    } else {
      return null;
    }
    if (prop.description !== undefined) field.description = prop.description;
    if (prop.minimum !== undefined) field.min = prop.minimum;
    if (prop.maximum !== undefined) field.max = prop.maximum;
    fields.push(field);
  }
  return fields;
}
