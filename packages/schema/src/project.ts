import * as z from "zod";
import { Asset } from "./asset.ts";
import { Composition } from "./composition.ts";
import { Id, IsoUtcDateTime } from "./primitives.ts";
import { named } from "./registry.ts";

export const CURRENT_SCHEMA_VERSION = 1;

export const AiRunRecord = named(
  "AiRunRecord",
  z.strictObject({
    id: Id,
    tool: z.string().min(1),
    provider: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    promptVersion: z.string().min(1).optional(),
    createdAt: IsoUtcDateTime,
    status: z.enum(["proposed", "applied", "discarded"]),
    summary: z.string(),
    opCount: z.int().min(0),
  }),
  "Log entry for one AI run (tool, model, prompt version, outcome).",
);
export type AiRunRecord = z.infer<typeof AiRunRecord>;

export const ProjectMeta = named(
  "ProjectMeta",
  z.strictObject({
    createdAt: IsoUtcDateTime,
    updatedAt: IsoUtcDateTime,
    aiRuns: z.array(AiRunRecord),
    templateId: Id.optional(),
  }),
);
export type ProjectMeta = z.infer<typeof ProjectMeta>;

export const ProjectKind = named(
  "ProjectKind",
  z.enum(["video", "motion", "photo"]),
  "Only selects the default UI; every kind is made of compositions.",
);
export type ProjectKind = z.infer<typeof ProjectKind>;

export const Project = named(
  "Project",
  z.strictObject({
    id: Id,
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    name: z.string(),
    kind: ProjectKind,
    assets: z.array(Asset),
    compositions: z.array(Composition),
    mainCompositionId: Id,
    meta: ProjectMeta,
  }),
  "A Lumacut project document. All times are integer microseconds.",
);
export type Project = z.infer<typeof Project>;
