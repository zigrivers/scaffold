/**
 * Strip end-of-string line/column spans from a location string.
 * Patterns matched (all anchored to end-of-string):
 *   - `:N` - trailing single line number
 *   - `:N-M` - trailing line range
 *   - `:N:M` - trailing line:column
 *   - `(line N)` (with optional leading whitespace) - prose-style line ref
 */
const LOCATION_SPAN_RE = /(?::\d+(?::\d+)?(?:-\d+)?|\s*\(line \d+\))$/

export function normalizeLocationForKey(location: string): string {
  return location.toLowerCase().trim().replace(LOCATION_SPAN_RE, '')
}

const LINE_MENTION_RE = /\bline \d+\b/gi
const AT_LINE_MENTION_RE = /\bat \d+\b(?!\s*(?:%|\b(?:seconds?|minutes?|hours?|items?|ms|s)\b))/gi
const SEVERITY_PREFIX_RE = /^\s*(?:p[0-3]|critical|high|medium|low|info)\s*:\s*/i

function normalizeNonCodeSegment(s: string): string {
  return s
    .toLowerCase()
    .replace(LINE_MENTION_RE, '')
    .replace(AT_LINE_MENTION_RE, '')
    .replace(SEVERITY_PREFIX_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeDescriptionForKey(description: string): string {
  if (description === '') return ''
  // Split on backticks: even indices are non-code, odd indices are code-span content.
  // Unmatched final backtick -> trailing odd segment is treated as code. That keeps
  // the result deterministic for identical malformed input.
  const parts = description.split('`')
  const out: string[] = []
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      out.push(normalizeNonCodeSegment(parts[i]))
    } else {
      out.push('`' + parts[i] + '`')
    }
  }
  return out.join(' ').replace(/\s+/g, ' ').trim()
}
