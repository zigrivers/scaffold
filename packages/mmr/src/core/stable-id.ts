import { createHash } from 'node:crypto'
import type { Finding } from '../types.js'

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

const LINE_MENTION_RE = /\b(?:at\s+)?line \d+\b/gi
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
const AT_INTEGER_MENTION_RE = /\bat \d+(?!\.\d)(?!\d)\b\.?/gi
const AT_INTEGER_VALUE_AFTER_RE = new RegExp(String.raw`^\s*(?:%|\b(?:${VALUE_AFTER_AT_UNITS})\b)`, 'i')
const AT_LOCATION_CONTEXT_BEFORE_RE = /\b(?:found|reported|detected|raised|located|declared|defined)\s+$/
const SEVERITY_PREFIX_RE = /^\s*(?:p[0-3]|critical|high|medium|low|info)\s*:\s*/i
const CODE_SPAN_RE = /`([^`]*)`/g

function normalizeNonCodeSegment(s: string): string {
  return s
    .toLowerCase()
    .replace(LINE_MENTION_RE, '')
    .replace(AT_INTEGER_MENTION_RE, (match, offset: number, full: string) => {
      const after = full.slice(offset + match.length)
      if (AT_INTEGER_VALUE_AFTER_RE.test(after)) return match
      const before = full.slice(0, offset)
      return AT_LOCATION_CONTEXT_BEFORE_RE.test(before) ? '' : match
    })
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

export function normalizeSuggestionForKey(suggestion: string): string {
  // Suggestions are intentionally distinguished by their full short text.
  // Do not apply description noise stripping here.
  if (suggestion === '') return ''
  const out: string[] = []
  let cursor = 0

  for (const match of suggestion.matchAll(CODE_SPAN_RE)) {
    const index = match.index ?? 0
    const before = suggestion.slice(cursor, index)
    appendNormalizedPart(out, normalizeSuggestionSegment(before), /^\s/.test(before))
    appendNormalizedPart(out, '`' + match[1] + '`', /\s$/.test(before))
    cursor = index + match[0].length
  }

  const tail = suggestion.slice(cursor)
  appendNormalizedPart(out, normalizeSuggestionSegment(tail), /^\s/.test(tail))
  return out.join('').trim()
}

function normalizeSuggestionSegment(s: string): string {
  return s
    .replace(/[A-Za-z][A-Za-z0-9_]*/g, (token) => (isMixedCaseIdentifier(token) ? token : token.toLowerCase()))
    .replace(/\s+/g, ' ')
    .trim()
}

function isMixedCaseIdentifier(token: string): boolean {
  return /[a-z][A-Z]|[A-Z][a-z]+[A-Z]|[A-Z]{2,}[a-z]|^[A-Z0-9_]{3,}$/.test(token)
}

function sha1(input: string): string {
  return createHash('sha1').update(input).digest('hex')
}

/**
 * Compute the stable identity key per §5 decision 2:
 *   finding_key = sha1(
 *     normalized_location + "|" + (category ?? "") + "|" +
 *     sha1(description_normalized) + "|" + sha1(suggestion_normalized)
 *   )
 *
 * Severity is intentionally excluded — the same underlying issue surfacing at
 * P1 vs P2 across channels should still reconcile to one key.
 */
export function computeFindingKey(finding: Finding): string {
  const loc = normalizeLocationForKey(finding.location)
  const cat = (finding.category ?? '').toLowerCase()
  const descHash = sha1(normalizeDescriptionForKey(finding.description))
  const sugHash = sha1(normalizeSuggestionForKey(finding.suggestion))
  return sha1(`${escapeKeyPart(loc)}|${escapeKeyPart(cat)}|${descHash}|${sugHash}`)
}

function escapeKeyPart(part: string): string {
  return part.replace(/\\/g, '\\\\').replace(/\|/g, '\\|')
}

export function descriptionShingle(description: string): string[] {
  const normalized = normalizeDescriptionForKey(description)
  if (normalized.length <= 5) return normalized === '' ? [] : [normalized]

  const grams = new Set<string>()
  for (let i = 0; i <= normalized.length - 5; i += 1) {
    grams.add(normalized.slice(i, i + 5))
  }
  return [...grams]
}

export function jaccardSimilarity(
  a: readonly string[] | ReadonlySet<string>,
  b: readonly string[] | ReadonlySet<string>,
): number {
  const left = a instanceof Set ? a : new Set(a)
  const right = b instanceof Set ? b : new Set(b)
  if (left.size === 0 && right.size === 0) return 1

  let intersection = 0
  for (const item of left) {
    if (right.has(item)) intersection += 1
  }

  const unionSize = left.size + right.size - intersection
  return intersection / unionSize
}
