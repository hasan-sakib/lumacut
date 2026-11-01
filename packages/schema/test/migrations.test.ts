import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION, migrateProject, SchemaVersionError } from "../src/index.ts";
import type { Migration } from "../src/index.ts";
import { loadFixtures } from "./fixtures.ts";

const [first] = loadFixtures("valid", "project");
if (first === undefined) throw new Error("expected at least one valid project fixture");
const current = first.value as Record<string, unknown>;

describe("migrateProject", () => {
  it("accepts a current-version document unchanged", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
    expect(migrateProject(current)).toStrictEqual(current);
  });

  it.each([null, [], "project", 42])("rejects non-object input %j", (input) => {
    expect(() => migrateProject(input)).toThrow(SchemaVersionError);
  });

  it.each([undefined, 0, 1.5, "1"])("rejects invalid schemaVersion %j", (schemaVersion) => {
    expect(() => migrateProject({ ...current, schemaVersion })).toThrow(SchemaVersionError);
  });

  it("rejects documents from a newer app with an actionable message", () => {
    expect(() => migrateProject({ ...current, schemaVersion: 2 })).toThrow(/Update Lumacut/);
  });

  it("runs the migration chain in order and validates the result", () => {
    // Simulate a future schema at version 3 whose version-1 docs lack `name`.
    const calls: number[] = [];
    const migrations: Record<number, Migration> = {
      1: (doc) => {
        calls.push(1);
        return { ...doc, name: "Migrated" };
      },
      2: (doc) => {
        calls.push(2);
        return { ...doc, schemaVersion: 1 }; // pretend v3 equals today's shape for validation
      },
    };
    const { name: _dropped, ...v1 } = current;
    expect(() => migrateProject(v1, migrations, 3)).toThrow(); // final shape has schemaVersion 3
    expect(calls).toEqual([1, 2]);
  });

  it("fails clearly when a migration step is missing", () => {
    expect(() => migrateProject(current, {}, 2)).toThrow(/No migration from schema version 1/);
  });

  it("validates the migrated document", () => {
    expect(() => migrateProject({ ...current, name: 5 })).toThrow();
  });
});
