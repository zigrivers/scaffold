import { z } from 'zod'

export const Severity = z.enum(['P0', 'P1', 'P2', 'P3'])

export const OutputFormat = z.enum(['json', 'text', 'markdown'])

const AuthConfigSchema = z.object({
  check: z.string(),
  timeout: z.number().default(5),
  failure_exit_codes: z.array(z.number()),
  recovery: z.string(),
})

type SeverityConfig = z.infer<typeof Severity>

export interface RegexFindingsParserConfig {
  kind: 'regex-findings'
  pattern: string
  flags?: string
  default_severity?: SeverityConfig
  fields: {
    id?: number
    category?: number
    severity?: number
    location: number
    description: number
    suggestion?: number
  }
}

export interface UnwrapJsonpathParserConfig {
  kind: 'unwrap-jsonpath'
  wrap: string
  then?: OutputParserConfig
}

export type OutputParserConfig =
  | string
  | UnwrapJsonpathParserConfig
  | RegexFindingsParserConfig

const RegexFindingsFieldsSchema = z.object({
  id: z.number().int().positive().optional(),
  category: z.number().int().positive().optional(),
  severity: z.number().int().positive().optional(),
  location: z.number().int().positive(),
  description: z.number().int().positive(),
  suggestion: z.number().int().positive().optional(),
}) satisfies z.ZodType<RegexFindingsParserConfig['fields']>

export const RegexFindingsParserSchema = z.object({
  kind: z.literal('regex-findings'),
  pattern: z.string(),
  flags: z.string().regex(/^[dgimsuvy]*$/).default('gm'),
  default_severity: Severity.default('P2'),
  fields: RegexFindingsFieldsSchema,
}) satisfies z.ZodType<RegexFindingsParserConfig>

export const UnwrapJsonpathParserSchema = z.object({
  kind: z.literal('unwrap-jsonpath'),
  wrap: z.string(),
  then: z.lazy(() => OutputParserSchema).default('default'),
}) satisfies z.ZodType<UnwrapJsonpathParserConfig>

export const OutputParserSchema: z.ZodType<OutputParserConfig> = z.lazy(() =>
  z.union([
    z.string(),
    z.discriminatedUnion('kind', [
      UnwrapJsonpathParserSchema,
      RegexFindingsParserSchema,
    ]),
  ]),
)

const ChannelConfigSchema = z.object({
  enabled: z.boolean().default(true),
  command: z.string().optional(),
  flags: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
  headers: z.record(z.string()).optional(),
  auth: AuthConfigSchema.optional(),
  prompt_wrapper: z.string().default('{{prompt}}'),
  output_parser: OutputParserSchema.default('default'),
  stderr: z.enum(['suppress', 'capture', 'passthrough']).default('capture'),
  timeout: z.number().optional(),
  extends: z.string().optional(),
  abstract: z.boolean().default(false),
})

const TemplateSchema = z.object({
  criteria: z.array(z.string()).optional(),
})

export const CompensatorConfigSchema = z.object({
  channel: z.string(),
  channel_focus_map: z.record(z.string()).optional(),
})

export type CompensatorConfig = z.infer<typeof CompensatorConfigSchema>

const DefaultsSchema = z.object({
  fix_threshold: Severity.default('P2'),
  timeout: z.number().default(300),
  format: OutputFormat.default('json'),
  parallel: z.boolean().default(true),
  job_retention_days: z.number().default(7),
  compensator: CompensatorConfigSchema.optional(),
})

export const MmrConfigSchema = z.object({
  version: z.number(),
  defaults: DefaultsSchema.default({}),
  review_criteria: z.array(z.string()).optional(),
  templates: z.record(TemplateSchema).optional(),
  channels: z.record(ChannelConfigSchema).default({}),
  channels_disabled: z.array(z.string()).optional(),
})

export type MmrConfigParsed = z.infer<typeof MmrConfigSchema>
export type ChannelConfigParsed = z.infer<typeof ChannelConfigSchema>
