import type { OutputParserConfig } from '../config/schema.js'
import type { Finding } from '../types.js'
import { jsonpathGet } from './jsonpath.js'

export interface ParsedOutput {
  approved: boolean
  findings: Finding[]
  summary: string
}

export type Parser = (raw: string) => ParsedOutput

/**
 * Remove ```json and ``` markdown fence markers from text.
 */
export function stripMarkdownFences(text: string): string {
  return text.replace(/^```(?:json)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '')
}

/**
 * Remove trailing commas before `}` and `]`.
 */
export function fixTrailingCommas(text: string): string {
  return text.replace(/,\s*([}\]])/g, '$1')
}

/**
 * Find first `{`, count brace depth, extract to matching `}`.
 * Tracks in-string state to ignore braces inside JSON string values.
 */
export function extractJson(text: string): string {
  const start = text.indexOf('{')
  if (start === -1) throw new Error('No JSON object found in output')

  let depth = 0
  let inString = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]

    if (inString) {
      if (ch === '\\') {
        i++ // Skip escaped character
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
    } else if (ch === '{') {
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) {
        return text.slice(start, i + 1)
      }
    }
  }

  throw new Error('Unbalanced braces in JSON output')
}

function extractJsonValue(text: string): string {
  let firstUnbalanced: Error | undefined

  for (let start = 0; start < text.length; start++) {
    const opener = text[start]
    if (opener !== '{' && opener !== '[') continue

    try {
      const candidate = extractBalancedJsonValue(text, start)
      JSON.parse(fixTrailingCommas(candidate))
      return candidate
    } catch (err) {
      firstUnbalanced ??= err instanceof Error ? err : new Error(String(err))
    }
  }

  if (firstUnbalanced) throw firstUnbalanced
  throw new Error('No JSON object or array found in output')
}

function extractBalancedJsonValue(text: string, start: number): string {
  const opener = text[start]
  const stack: string[] = []
  let inString = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]

    if (inString) {
      if (ch === '\\') {
        i++
      } else if (ch === '"') {
        inString = false
      }
      continue
    }

    if (ch === '"') {
      inString = true
    } else if (ch === '{' || ch === '[') {
      stack.push(ch)
    } else if (ch === '}' || ch === ']') {
      const expected = ch === '}' ? '{' : '['
      if (stack.pop() !== expected) {
        throw new Error(`Mismatched JSON delimiters near: ${text.slice(start, i + 1)}`)
      }
      if (stack.length === 0) {
        return text.slice(start, i + 1)
      }
    }
  }

  throw new Error(`Unbalanced ${opener === '{' ? 'braces' : 'brackets'} in JSON output`)
}

function parseJsonFromOutput(raw: string): unknown {
  const text = extractJsonValue(stripMarkdownFences(raw))
  return JSON.parse(fixTrailingCommas(text))
}

/**
 * Default parser: strips markdown fences, extracts JSON from surrounding text,
 * fixes trailing commas, then JSON.parse.
 */
export function validateParsedOutput(obj: unknown): ParsedOutput {
  if (typeof obj !== 'object' || obj === null) {
    throw new Error('Parsed output is not an object')
  }
  const record = obj as Record<string, unknown>
  return {
    approved: typeof record.approved === 'boolean' ? record.approved : false,
    findings: Array.isArray(record.findings) ? record.findings.map(validateFinding) : [],
    summary: typeof record.summary === 'string' ? record.summary : '',
  }
}

export function validateFinding(f: unknown): Finding {
  if (typeof f !== 'object' || f === null) {
    return { severity: 'P2', location: 'unknown', description: 'Malformed finding', suggestion: '' }
  }
  const record = f as Record<string, unknown>
  return {
    severity: (['P0', 'P1', 'P2', 'P3'].includes(record.severity as string)
      ? record.severity : 'P2') as Finding['severity'],
    location: typeof record.location === 'string' ? record.location : 'unknown',
    description: typeof record.description === 'string' ? record.description : String(record.description ?? ''),
    suggestion: typeof record.suggestion === 'string' ? record.suggestion : '',
    ...(typeof record.id === 'string' ? { id: record.id } : {}),
    ...(typeof record.category === 'string' ? { category: record.category } : {}),
  }
}

export function validateFindingStrict(f: unknown): Finding {
  if (typeof f !== 'object' || f === null) {
    throw new Error('Finding must be an object')
  }
  const record = f as Record<string, unknown>
  if (!['P0', 'P1', 'P2', 'P3'].includes(record.severity as string)) {
    throw new Error('Finding missing or invalid severity (must be P0-P3)')
  }
  if (typeof record.location !== 'string' || !record.location) {
    throw new Error('Finding missing location')
  }
  if (typeof record.description !== 'string' || !record.description) {
    throw new Error('Finding missing description')
  }
  return {
    severity: record.severity as Finding['severity'],
    location: record.location as string,
    description: record.description as string,
    suggestion: typeof record.suggestion === 'string' ? record.suggestion : '',
    ...(typeof record.id === 'string' ? { id: record.id } : {}),
    ...(typeof record.category === 'string' ? { category: record.category } : {}),
  }
}

export function validateParsedOutputStrict(obj: unknown): ParsedOutput {
  if (typeof obj !== 'object' || obj === null) {
    throw new Error('Input must be an object')
  }
  const record = obj as Record<string, unknown>
  if (!Array.isArray(record.findings)) {
    throw new Error('Input findings must be an array')
  }
  return {
    approved: typeof record.approved === 'boolean' ? record.approved : false,
    findings: record.findings.map(validateFindingStrict),
    summary: typeof record.summary === 'string' ? record.summary : '',
  }
}

function defaultParser(raw: string): ParsedOutput {
  let text = stripMarkdownFences(raw)
  text = extractJson(text)
  text = fixTrailingCommas(text)
  return validateParsedOutput(JSON.parse(text))
}

/**
 * Gemini parser: tries to unwrap `{ "response": "..." }` wrapper,
 * then delegates to defaultParser.
 */
function geminiParser(raw: string): ParsedOutput {
  // First try to parse the raw text as JSON to check for wrapper
  let text = stripMarkdownFences(raw)
  text = extractJson(text)
  text = fixTrailingCommas(text)

  try {
    const outer = JSON.parse(text)
    if (typeof outer.response === 'string') {
      // Unwrap the response field and parse it with the default parser
      return defaultParser(outer.response)
    }
    // No wrapper — validate and return as ParsedOutput
    return validateParsedOutput(outer)
  } catch {
    // Fall back to default parser on the original raw input
    return defaultParser(raw)
  }
}

function docConformanceParser(raw: string): ParsedOutput {
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) {
      return {
        approved: false,
        findings: [{
          severity: 'P1', location: 'doc-conformance',
          description: 'doc-conformance channel returned valid JSON but not an array — malformed output',
          suggestion: 'Check scaffold observe audit --output-mode=mmr-findings produces a JSON array',
        }],
        summary: 'doc-conformance: output was not a JSON array',
      }
    }
    const findings = arr.map(validateFindingStrict)
    const approved = findings.every((f) => f.severity === 'P2' || f.severity === 'P3')
    const summary = `doc-conformance: ${findings.length} finding(s)${approved ? '' : ' (blocking)'}`
    return { approved, findings, summary }
  } catch {
    return {
      approved: false,
      findings: [{
        severity: 'P1', location: 'doc-conformance',
        description: 'Failed to parse doc-conformance output', suggestion: '',
      }],
      summary: 'doc-conformance: parse error',
    }
  }
}

const builtinParsers: Record<string, Parser> = {
  default: defaultParser,
  gemini: geminiParser,
  'doc-conformance': docConformanceParser,
}

/**
 * Build or look up a parser.
 *
 * String form looks up a built-in parser by name. Object form is intentionally
 * routed through buildParser so structured configs are never silently ignored.
 */
export function getParser(spec: string | OutputParserConfig): Parser {
  if (typeof spec === 'string') {
    return builtinParsers[spec] ?? builtinParsers['default']
  }
  return buildParser(spec)
}

/**
 * When an `unwrap-jsonpath` parse fails, return a clear, actionable error IF the
 * envelope's status field marks an interrupted/incomplete run (per the optional
 * `incomplete` guard); otherwise return the original error unchanged. This turns
 * grok's "stopReason: Cancelled + ack-only $.text" case from a misleading
 * "No JSON object found in output" into an honest "did not complete" message.
 */
function incompleteOrDefault(
  decoded: unknown,
  spec: Extract<OutputParserConfig, { kind: 'unwrap-jsonpath' }>,
  fallback: Error,
): Error {
  const guard = spec.incomplete
  if (!guard) return fallback
  let status: unknown
  try {
    status = jsonpathGet(decoded, guard.status_path)
  } catch {
    // A malformed custom status_path must never REPLACE the genuine parse error
    // with a jsonpath internal error — the guard can only improve the message.
    return fallback
  }
  if (typeof status === 'string' && guard.values.includes(status)) {
    // Human-readable label: "$.stopReason" → "stopReason". Fall back to the raw
    // path if stripping the root leaves nothing (e.g. a bare "$").
    const field = guard.status_path.replace(/^\$\.?/, '') || guard.status_path
    return new Error(`channel run did not complete (${field}=${status}) before emitting findings — ${guard.message}`)
  }
  return fallback
}

export function buildParser(spec: OutputParserConfig): Parser {
  if (typeof spec === 'string') {
    return getParser(spec)
  }
  if (spec.kind === 'unwrap-jsonpath') {
    const nextSpec = spec.then ?? 'default'
    const nextParser = getParser(nextSpec)
    return (raw: string) => {
      const decoded = parseJsonFromOutput(raw)
      const unwrapped = jsonpathGet(decoded, spec.wrap)
      if (unwrapped === undefined) {
        throw incompleteOrDefault(decoded, spec, new Error(`jsonpath did not match: ${spec.wrap}`))
      }
      const nextRaw = typeof unwrapped === 'string' ? unwrapped : JSON.stringify(unwrapped)
      try {
        return nextParser(nextRaw)
      } catch (err) {
        throw incompleteOrDefault(decoded, spec, err instanceof Error ? err : new Error(String(err)))
      }
    }
  }
  if (spec.kind === 'regex-findings') {
    return (raw: string) => parseRegexFindings(raw, spec)
  }
  throw new Error(`Unsupported output_parser kind: ${(spec as { kind: string }).kind}`)
}

function parseRegexFindings(
  raw: string,
  spec: Extract<OutputParserConfig, { kind: 'regex-findings' }>,
): ParsedOutput {
  const regex = new RegExp(spec.pattern, spec.flags ?? 'gm')
  const findings: Finding[] = []
  let match: RegExpExecArray | null

  while ((match = regex.exec(raw)) !== null) {
    const field = (index: number | undefined): string | undefined =>
      index === undefined ? undefined : match?.[index]
    const location = field(spec.fields.location)
    const description = field(spec.fields.description)
    if (!location?.trim() || !description?.trim()) {
      throw new Error('regex-findings parser requires non-empty location and description captures')
    }
    const severityValue = field(spec.fields.severity)
    const severity = isSeverity(severityValue) ? severityValue : (spec.default_severity ?? 'P2')
    findings.push({
      id: field(spec.fields.id),
      category: field(spec.fields.category),
      severity,
      location,
      description,
      suggestion: field(spec.fields.suggestion) ?? '',
    })
    if (!regex.global) break
    if (match[0] === '') regex.lastIndex += 1
  }

  return {
    approved: findings.length === 0,
    findings,
    summary: findings.length === 0 ? 'No regex findings.' : `Parsed ${findings.length} regex finding(s).`,
  }
}

function isSeverity(value: string | undefined): value is Finding['severity'] {
  return value === 'P0' || value === 'P1' || value === 'P2' || value === 'P3'
}

/**
 * Wraps getParser in try/catch, returns error finding on parse failure.
 */
export function parseChannelOutput(raw: string, parserSpec: string | OutputParserConfig): ParsedOutput {
  try {
    const parser = getParser(parserSpec)
    return parser(raw)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      approved: false,
      findings: [
        {
          severity: 'P1',
          location: 'output-parser',
          description: `Failed to parse channel output: ${message}`,
          suggestion: 'Check the raw output for unexpected format changes.',
        },
      ],
      summary: 'Output parsing failed.',
    }
  }
}
