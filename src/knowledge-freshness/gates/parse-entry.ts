import yaml from 'js-yaml'

/**
 * Minimal frontmatter shape used by the freshness CI gates. We keep this
 * deliberately narrow rather than reusing `KnowledgeEntry` from
 * `src/types/index.ts` because the gates operate on raw `.md` files in a PR
 * checkout (no project resolver, no overrides) and need to be tolerant of
 * partially-populated frontmatter from in-progress drafts.
 */
export interface ParsedFreshnessEntry {
  /** Raw frontmatter object (yaml.JSON_SCHEMA — ISO dates stay strings). */
  frontmatter: Record<string, unknown>
  /** Markdown body (everything after the closing `---`). */
  body: string
  /** Convenience accessor: declared `sources[].url` values (empty array if none). */
  sourceUrls: string[]
  /** Convenience accessor: declared `volatility` value (or null). */
  volatility: 'stable' | 'evolving' | 'fast-moving' | null
}

const VOLATILITIES = new Set(['stable', 'evolving', 'fast-moving'])

/**
 * Parse a freshness-relevant entry. Throws only on unrecoverable shape errors
 * (no frontmatter at all, unclosed `---`); a missing or non-array `sources`
 * surfaces as an empty `sourceUrls` so gate callers can decide whether to
 * treat that as a hard fail (link-check) or a noop (over-rewrite).
 */
export function parseEntry(raw: string): ParsedFreshnessEntry {
  const lines = raw.split('\n')
  if (lines[0]?.trim() !== '---') {
    throw new Error('entry has no frontmatter')
  }
  let close = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { close = i; break }
  }
  if (close === -1) throw new Error('frontmatter unclosed')

  const fm = yaml.load(lines.slice(1, close).join('\n'), { schema: yaml.JSON_SCHEMA }) as
    Record<string, unknown> | null
  const fmObj = fm && typeof fm === 'object' ? fm : {}

  const body = lines.slice(close + 1).join('\n')

  const sources = Array.isArray(fmObj['sources']) ? fmObj['sources'] as unknown[] : []
  const sourceUrls = sources
    .map((s) => (s && typeof s === 'object' && 'url' in s ? (s as { url?: unknown }).url : undefined))
    .filter((u): u is string => typeof u === 'string' && u.length > 0)

  const volRaw = fmObj['volatility']
  const volatility = typeof volRaw === 'string' && VOLATILITIES.has(volRaw)
    ? (volRaw as ParsedFreshnessEntry['volatility'])
    : null

  return { frontmatter: fmObj, body, sourceUrls, volatility }
}
