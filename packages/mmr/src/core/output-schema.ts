import type { OutputParserConfig } from '../config/schema.js'

/**
 * The JSON Schema for a review channel's reply, used to force structured final
 * output from CLIs that support schema-constrained generation (grok's
 * `--json-schema`). Verified on grok 0.2.103 (2026-07-18): the grok-4.5
 * reasoning model frequently ends an UNconstrained review with
 * `stopReason: "Cancelled"` and only a progress ack in `$.text` when the
 * account runs concurrent sessions (parallel agents/worktrees); with the
 * schema constraint the final answer reliably lands in `$.text` (a 4-way
 * concurrency repro went from 5/8 cancelled without the flag to 1/8 with it).
 *
 * Shape mirrors what the review prompt asks for and what
 * `validateFindingStrict` requires (severity/location/description mandatory).
 */
export const FINDINGS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
          location: { type: 'string' },
          category: { type: 'string' },
          description: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['severity', 'location', 'description', 'suggestion'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['approved', 'findings', 'summary'],
} as const

/**
 * Placeholder used in channel `flags` config (like `{{prompt_file}}` /
 * `{{neutral_cwd}}`): review dispatch substitutes the serialized findings
 * schema; critique — whose reply shape differs — strips the flag pair instead.
 */
export const FINDINGS_SCHEMA_PLACEHOLDER = '{{findings_schema}}'

/**
 * A schema-constrained channel emits one schema-shaped JSON object PER TURN
 * (intermediate progress acks included), so extraction MUST take the last
 * object. Per-field config deep-merge can drift flags and parser apart — e.g.
 * a user config that restates the pre-3.2.0 grok `output_parser` (whose
 * terminal parser was 'default') while inheriting the new builtin flags with
 * `--json-schema`. Honoring that combination silently reintroduces the
 * first-object verdict flip this schema work exists to prevent, so when the
 * flags carry the placeholder, coerce a terminal 'default' to 'default-last'.
 * Custom parsers (regex-findings, gemini, etc.) are left untouched — the
 * hazard is specific to first-object 'default' extraction.
 */
export function coerceParserForSchemaFlags(
  flags: string[],
  parser: string | OutputParserConfig,
): string | OutputParserConfig {
  if (!flags.some((f) => f.includes(FINDINGS_SCHEMA_PLACEHOLDER))) return parser
  if (parser === 'default') return 'default-last'
  if (typeof parser === 'object' && parser.kind === 'unwrap-jsonpath'
    && (parser.then === undefined || parser.then === 'default')) {
    return { ...parser, then: 'default-last' }
  }
  return parser
}

/** Replace every placeholder arg with the serialized findings schema. */
export function substituteFindingsSchema(flags: string[]): string[] {
  return flags.map((f) =>
    f.includes(FINDINGS_SCHEMA_PLACEHOLDER)
      ? f.split(FINDINGS_SCHEMA_PLACEHOLDER).join(JSON.stringify(FINDINGS_JSON_SCHEMA))
      : f,
  )
}

/**
 * Remove the schema flag from a flags array: drops every arg carrying the
 * placeholder AND the flag token immediately before it (any `--*` token, not
 * just `--json-schema` — a customizer may pass the placeholder to a
 * differently-named flag, and leaving that flag valueless would break the
 * CLI invocation). Used by critique, which reuses review channel flags
 * verbatim but must not constrain replies to the findings shape.
 */
export function stripFindingsSchemaFlags(flags: string[]): string[] {
  const out: string[] = []
  for (const f of flags) {
    if (f.includes(FINDINGS_SCHEMA_PLACEHOLDER)) {
      if (out[out.length - 1]?.startsWith('--')) out.pop()
      continue
    }
    out.push(f)
  }
  return out
}
