import type { Finding } from '../types.js'

export interface ParsedOutput {
  approved: boolean
  findings: Finding[]
  summary: string
}

export type Parser = (raw: string) => ParsedOutput

/**
 * Remove ```json and ``` markdown fence markers from text.
 */
function stripMarkdownFences(text: string): string {
  return text.replace(/^```(?:json)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '')
}

/**
 * Remove trailing commas before `}` and `]`.
 */
function fixTrailingCommas(text: string): string {
  return text.replace(/,\s*([}\]])/g, '$1')
}

/**
 * Find first `{`, count brace depth, extract to matching `}`.
 */
function extractJson(text: string): string {
  const start = text.indexOf('{')
  if (start === -1) throw new Error('No JSON object found in output')

  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') depth--

    if (depth === 0) {
      return text.slice(start, i + 1)
    }
  }

  throw new Error('Unbalanced braces in JSON output')
}

/**
 * Default parser: strips markdown fences, extracts JSON from surrounding text,
 * fixes trailing commas, then JSON.parse.
 */
function validateParsedOutput(obj: unknown): ParsedOutput {
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

function validateFinding(f: unknown): Finding {
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
    // No wrapper — treat as direct ParsedOutput
    return outer as ParsedOutput
  } catch {
    // Fall back to default parser on the original raw input
    return defaultParser(raw)
  }
}

const parsers: Record<string, Parser> = {
  default: defaultParser,
  gemini: geminiParser,
}

/**
 * Returns a parser function by name. Falls back to default if name is unknown.
 */
export function getParser(name: string): Parser {
  return parsers[name] ?? parsers['default']
}

/**
 * Wraps getParser in try/catch, returns error finding on parse failure.
 */
export function parseChannelOutput(raw: string, parserName: string): ParsedOutput {
  try {
    const parser = getParser(parserName)
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
