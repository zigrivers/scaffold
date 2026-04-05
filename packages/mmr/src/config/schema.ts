import { z } from 'zod'

export const Severity = z.enum(['P0', 'P1', 'P2', 'P3'])

export const OutputFormat = z.enum(['json', 'text', 'markdown', 'sarif'])

const AuthConfigSchema = z.object({
  check: z.string(),
  timeout: z.number().default(5),
  failure_exit_codes: z.array(z.number()),
  recovery: z.string(),
})

const ChannelConfigSchema = z.object({
  enabled: z.boolean().default(true),
  command: z.string(),
  flags: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
  auth: AuthConfigSchema,
  prompt_wrapper: z.string().default('{{prompt}}'),
  output_parser: z.string().default('default'),
  stderr: z.enum(['suppress', 'capture', 'passthrough']).default('capture'),
  timeout: z.number().optional(),
})

const TemplateSchema = z.object({
  criteria: z.array(z.string()).optional(),
})

const DefaultsSchema = z.object({
  fix_threshold: Severity.default('P2'),
  timeout: z.number().default(300),
  format: OutputFormat.default('json'),
  parallel: z.boolean().default(true),
  job_retention_days: z.number().default(7),
})

export const MmrConfigSchema = z.object({
  version: z.number(),
  defaults: DefaultsSchema.default({}),
  review_criteria: z.array(z.string()).optional(),
  templates: z.record(TemplateSchema).optional(),
  channels: z.record(ChannelConfigSchema).default({}),
})

export type MmrConfigParsed = z.infer<typeof MmrConfigSchema>
export type ChannelConfigParsed = z.infer<typeof ChannelConfigSchema>
