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
const VALUE_AFTER_AT_UNITS = [
  'seconds?',
  'minutes?',
  'hours?',
  'items?',
  'bytes?',
  'kb',
  'mb',
  'gb',
  'pixels?',
  'elements?',
  'chars?',
  'characters?',
  'ms',
  's',
].join('|')
const AT_LINE_MENTION_RE =
  new RegExp(String.raw`\bat \d+(?![.\d])\b(?!\s*(?:%|\b(?:${VALUE_AFTER_AT_UNITS})\b))`, 'gi')
const SEVERITY_PREFIX_RE = /^\s*(?:p[0-3]|critical|high|medium|low|info)\s*:\s*/i
const CODE_SPAN_RE = /`([^`]*)`/g

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
  const out: string[] = []
  let cursor = 0

  for (const match of description.matchAll(CODE_SPAN_RE)) {
    const index = match.index ?? 0
    const before = description.slice(cursor, index)
    appendNormalizedPart(out, normalizeNonCodeSegment(before), /^\s/.test(before))
    appendNormalizedPart(out, '`' + match[1] + '`', /\s$/.test(before))
    cursor = index + match[0].length
  }

  const tail = description.slice(cursor)
  appendNormalizedPart(out, normalizeNonCodeSegment(tail), /^\s/.test(tail))
  return out.join('').trim()
}

function appendNormalizedPart(out: string[], part: string, spaceBefore: boolean): void {
  if (part === '') return
  if (out.length > 0 && spaceBefore) out.push(' ')
  out.push(part)
}
