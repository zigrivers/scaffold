// src/config/schema.ts

import { z } from 'zod'

const CustomStepSchema = z.object({
  enabled: z.boolean().optional(),
  depth: z.number().int().min(1).max(5).optional(),
}).strict()

const CustomSchema = z.object({
  default_depth: z.number().int().min(1).max(5).optional(),
  steps: z.record(z.string(), CustomStepSchema).optional(),
}).strict()

const ProjectSchema = z.object({
  name: z.string().min(1).optional(),
  platforms: z.array(z.enum(['web', 'mobile', 'desktop'])).optional(),
}).passthrough()  // allow unknown fields per ADR-033

export const ConfigSchema = z.object({
  version: z.literal(2),
  methodology: z.enum(['deep', 'mvp', 'custom']),
  custom: CustomSchema.optional(),
  platforms: z.array(z.enum(['claude-code', 'codex', 'gemini'])).min(1),
  project: ProjectSchema.optional(),
}).passthrough()  // allow unknown fields at top level per ADR-033

export type ParsedConfig = z.infer<typeof ConfigSchema>
