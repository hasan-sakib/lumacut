import * as z from "zod";
import "./index.ts";
import { schemaRegistry } from "./registry.ts";

export const JSON_SCHEMA_ID = "https://lumacut.dev/schema/lumacut.schema.json";

type JsonSchemaObject = Record<string, unknown>;

interface DiscriminatedUnionDef {
  type: string;
  discriminator?: unknown;
}

/**
 * Builds the single JSON Schema bundle for every registered schema, as `$defs` keyed by id.
 * The root accepts either a Project or an Op so codegen emits a model for every definition.
 * Discriminated unions get an OpenAPI-style `discriminator` so Pydantic uses tagged unions.
 */
export function buildJsonSchema(): JsonSchemaObject {
  const exported = z.toJSONSchema(schemaRegistry, {
    target: "draft-2020-12",
    uri: (id) => `#/$defs/${id}`,
    override: (ctx) => {
      const def = (ctx.zodSchema as { _zod: { def: DiscriminatedUnionDef } })._zod.def;
      if (def.type === "union" && typeof def.discriminator === "string") {
        (ctx.jsonSchema as JsonSchemaObject).discriminator = { propertyName: def.discriminator };
      }
    },
  }) as { schemas: Record<string, JsonSchemaObject> };

  const defs: Record<string, JsonSchemaObject> = {};
  for (const [id, schema] of Object.entries(exported.schemas)) {
    const { $schema: _schema, $id: _id, ...rest } = schema;
    defs[id] = rest;
  }

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: JSON_SCHEMA_ID,
    title: "LumacutDocument",
    description: "GENERATED from packages/schema (Zod) by `make gen-schema`. Do not edit by hand.",
    anyOf: [{ $ref: "#/$defs/Project" }, { $ref: "#/$defs/Op" }],
    $defs: defs,
  };
}

export function serializeJsonSchema(): string {
  return `${JSON.stringify(buildJsonSchema(), null, 2)}\n`;
}
