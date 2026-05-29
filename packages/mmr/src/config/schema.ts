import { z } from 'zod'

export const Severity = z.enum(['P0', 'P1', 'P2', 'P3'])

export const OutputFormat = z.enum(['json', 'text', 'markdown'])

const AuthConfigSchema = z.object({
  check: z.string(),
  timeout: z.number().default(5),
  failure_exit_codes: z.array(z.number()),
  recovery: z.string(),
})

// Auth-probe config for HTTP channels (T1-C). Distinct from the subprocess
// AuthConfigSchema: an HTTP probe is an HTTP request (method + accepted status
// codes), not a spawned command. `check_endpoint` is optional — when absent,
// the probe URL is derived from `endpoint` via `deriveProbeUrl` (a trailing
// `/chat/completions` → `/models`); the schema rejects http channels where
// neither is available.
const HttpAuthConfigSchema = z.object({
  check_endpoint: z.string().optional(),
  check_method: z.string().default('GET'),
  check_status_ok: z.array(z.number()).default([200]),
  timeout: z.number().default(5),
  recovery: z.string().optional(),
})

/**
 * Derive the auth-probe URL from an openai-chat endpoint by replacing a
 * trailing `/chat/completions` with `/models` (handles both `.../v1/chat/...`
 * and bare `.../chat/...` shapes). Returns undefined when there is no trailing
 * `/chat/completions` — callers then require an explicit `auth.check_endpoint`.
 */
export function deriveProbeUrl(endpoint: string): string | undefined {
  const suffix = '/chat/completions'
  if (endpoint.endsWith(suffix)) {
    return endpoint.slice(0, -suffix.length) + '/models'
  }
  return undefined
}

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

// Fields common to every channel kind. Shared across both discriminated-union
// arms so existing consumers can keep reading ch.command/ch.auth/etc. off the
// union without narrowing (they're subprocess-relevant but harmless on http).
const CommonChannelFields = {
  enabled: z.boolean().default(true),
  command: z.string().optional(),
  flags: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
  headers: z.record(z.string()).optional(),
  prompt_wrapper: z.string().default('{{prompt}}'),
  // How the dispatcher hands the prompt to the channel process:
  //   'stdin'       — pipe the prompt to stdin (default; claude/gemini/codex)
  //   'prompt-file' — write the prompt to a temp file and pass its path via a
  //                   {{prompt_file}} placeholder in flags (or appended), for
  //                   CLIs like grok whose prompt flag requires an arg value
  //                   and ignore stdin. Omitted ⇒ stdin.
  prompt_delivery: z.enum(['stdin', 'prompt-file']).optional(),
  output_parser: OutputParserSchema.default('default'),
  stderr: z.enum(['suppress', 'capture', 'passthrough']).default('capture'),
  timeout: z.number().optional(),
  // Channel inheritance (v3.28). command/auth stay optional so abstract bases
  // and `extends` children (resolved before parse) validate.
  extends: z.string().optional(),
  abstract: z.boolean().default(false),
}

const SubprocessChannelSchema = z.object({
  kind: z.literal('subprocess'),
  // Subprocess auth is a spawned command (check + failure_exit_codes).
  auth: AuthConfigSchema.optional(),
  ...CommonChannelFields,
})

// NOTE: endpoint/model/endpoint_convention are required unconditionally, so an
// abstract http *template* (providing only shared headers for children to
// extend) is not supported — http channels must be concrete. Subprocess
// abstract templates remain supported (command is optional).
const HttpChannelSchema = z.object({
  kind: z.literal('http'),
  endpoint: z.string(),
  model: z.string(),
  // Only the openai-chat convention ships in v3.30b (§5 decision 8).
  endpoint_convention: z.literal('openai-chat'),
  api_key_env: z.string().optional(),
  api_key_header: z.string().default('Authorization'),
  api_key_prefix: z.string().default('Bearer '),
  // HTTP auth is an HTTP probe (GET <endpoint→/models>), always defaulted so
  // the dispatcher/auth-probe can read auth.check_method/check_status_ok.
  auth: HttpAuthConfigSchema.default({}),
  ...CommonChannelFields,
})

/**
 * Injects `kind: 'subprocess'` into any channel object missing it BEFORE the
 * discriminatedUnion runs. Zod picks the union arm from the RAW discriminator
 * value before defaults apply, so without this a legacy config (no `kind`)
 * would fail to parse entirely.
 */
function injectSubprocessDefault(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw
  const obj = raw as Record<string, unknown>
  if (obj.kind === undefined) return { ...obj, kind: 'subprocess' }
  return obj
}

const ChannelConfigSchema = z.preprocess(
  injectSubprocessDefault,
  z.discriminatedUnion('kind', [SubprocessChannelSchema, HttpChannelSchema]),
).superRefine((ch, ctx) => {
  // An http channel must have a probeable auth endpoint: either an explicit
  // auth.check_endpoint, or a derivable one (endpoint ends in /chat/completions).
  if (ch.kind === 'http' && !ch.auth.check_endpoint && !deriveProbeUrl(ch.endpoint)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `endpoint "${ch.endpoint}" does not end in /chat/completions; auth.check_endpoint is required.`,
    })
  }
})

const TemplateSchema = z.object({
  criteria: z.array(z.string()).optional(),
})

export const CompensatorConfigSchema = z.object({
  channel: z.string().optional(),
  channel_focus_map: z.record(z.string()).optional(),
}).strict().refine(
  (cfg) => cfg.channel !== undefined || cfg.channel_focus_map !== undefined,
  { message: 'defaults.compensator must define channel or channel_focus_map' },
)

export type CompensatorConfig = z.infer<typeof CompensatorConfigSchema>

const LoopControlSchema = z.object({
  max_rounds_default: z.number().int().positive().default(5),
  repeat_suppression_enabled: z.boolean().default(false),
  repeat_downgrade_after: z.number().int().positive().optional(),
  repeat_suppress_after: z.number().int().positive().optional(),
})
  .refine(
    (lc) => {
      if (!lc.repeat_suppression_enabled) return true
      return lc.repeat_downgrade_after !== undefined && lc.repeat_suppress_after !== undefined
    },
    {
      message:
        'loop_control.repeat_suppression_enabled requires both repeat_downgrade_after and repeat_suppress_after',
    },
  )
  .refine(
    (lc) => {
      if (lc.repeat_downgrade_after === undefined || lc.repeat_suppress_after === undefined) {
        return true
      }
      return lc.repeat_suppress_after >= lc.repeat_downgrade_after
    },
    {
      message: 'loop_control.repeat_suppress_after must be greater than or equal to repeat_downgrade_after',
    },
  )

const DefaultsSchema = z.object({
  fix_threshold: Severity.default('P2'),
  timeout: z.number().default(300),
  format: OutputFormat.default('json'),
  parallel: z.boolean().default(true),
  job_retention_days: z.number().default(7),
  loop_control: LoopControlSchema.default({}),
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
export type SubprocessChannelParsed = z.infer<typeof SubprocessChannelSchema>
export type HttpChannelParsed = z.infer<typeof HttpChannelSchema>
export type HttpAuthConfigParsed = z.infer<typeof HttpAuthConfigSchema>
