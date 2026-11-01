import { describe, expect, it } from "vitest";
import type * as z from "zod";
import { Op, Project } from "../src/index.ts";
import { loadFixtures, type FixtureKind } from "./fixtures.ts";

const SCHEMAS: Record<FixtureKind, z.ZodType> = { project: Project, op: Op };

describe.each(["project", "op"] as const)("%s fixtures", (kind) => {
  const schema = SCHEMAS[kind];

  it.each(loadFixtures("valid", kind).map((c) => [c.name, c] as const))(
    "accepts and round-trips: %s",
    (_name, c) => {
      const result = schema.safeParse(c.value);
      expect(result.error?.issues).toBeUndefined();
      expect(result.data).toStrictEqual(c.value);
    },
  );

  it.each(loadFixtures("invalid", kind).map((c) => [c.name, c] as const))(
    "rejects: %s",
    (_name, c) => {
      expect(schema.safeParse(c.value).success).toBe(false);
    },
  );
});
