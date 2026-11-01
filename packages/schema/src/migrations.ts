import { CURRENT_SCHEMA_VERSION, Project } from "./project.ts";

export type ProjectDocument = Record<string, unknown>;

/** Upgrades a document from schema version `n` to `n + 1`. */
export type Migration = (doc: ProjectDocument) => ProjectDocument;

/**
 * Migrations keyed by the version they upgrade from. Empty while the schema is at version 1;
 * from M3 (first persisted projects) every breaking schema change must add an entry here.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

export class SchemaVersionError extends Error {
  override name = "SchemaVersionError";
}

function isRecord(value: unknown): value is ProjectDocument {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Brings a stored project document up to the current schema version and validates it.
 * Throws SchemaVersionError for documents that are not projects or come from a newer app.
 */
export function migrateProject(
  input: unknown,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
  currentVersion: number = CURRENT_SCHEMA_VERSION,
): Project {
  if (!isRecord(input)) {
    throw new SchemaVersionError("Not a project document: expected a JSON object.");
  }
  const version = input.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new SchemaVersionError("Not a project document: schemaVersion is missing or invalid.");
  }
  if (version > currentVersion) {
    throw new SchemaVersionError(
      `This project uses schema version ${String(version)}, but this app only understands up to ` +
        `${String(currentVersion)}. Update Lumacut to open it.`,
    );
  }
  let doc = input;
  for (let v = version; v < currentVersion; v += 1) {
    const migrate = migrations[v];
    if (migrate === undefined) {
      throw new SchemaVersionError(`No migration from schema version ${String(v)}.`);
    }
    doc = { ...migrate(doc), schemaVersion: v + 1 };
  }
  return Project.parse(doc);
}
