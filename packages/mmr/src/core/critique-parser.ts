import { stripMarkdownFences, extractJson, fixTrailingCommas } from './parser.js'
import { CRITIQUE_KINDS, type CritiqueItem, type CritiqueKind } from '../types/critique.js'

export interface ParsedCritique {
  items: CritiqueItem[]
  summary: string
}

function coerceKind(value: unknown): CritiqueKind {
  return CRITIQUE_KINDS.includes(value as CritiqueKind) ? (value as CritiqueKind) : 'consideration'
}

/** Validate one raw item; returns null when it has no usable observation. */
function validateItem(raw: unknown): CritiqueItem | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  const observation = typeof record.observation === 'string' ? record.observation.trim() : ''
  if (!observation) return null
  const theme = typeof record.theme === 'string' && record.theme.trim()
    ? record.theme.trim()
    : 'general'
  const item: CritiqueItem = {
    kind: coerceKind(record.kind),
    theme,
    observation,
  }
  if (typeof record.recommendation === 'string' && record.recommendation.trim()) {
    item.recommendation = record.recommendation.trim()
  }
  return item
}

/**
 * CLI envelope keys whose string value carries the model's actual reply. The
 * subprocess channels wrap their output differently — claude → `result`,
 * grok → `text`, gemini → `response` — so when the top-level JSON has no
 * `items`, we recurse into a wrapper string. Codex returns the reply directly.
 */
const WRAPPER_KEYS = ['result', 'text', 'response', 'output', 'content', 'message']

function fromObject(obj: Record<string, unknown>, depth: number): ParsedCritique | null {
  if (Array.isArray(obj.items)) {
    const items = obj.items.map(validateItem).filter((i): i is CritiqueItem => i !== null)
    return { items, summary: typeof obj.summary === 'string' ? obj.summary : '' }
  }
  if (depth <= 0) return null
  for (const key of WRAPPER_KEYS) {
    if (typeof obj[key] === 'string') {
      const inner = parseAtDepth(obj[key] as string, depth - 1)
      if (inner && (inner.items.length > 0 || inner.summary)) return inner
    }
  }
  return null
}

function parseAtDepth(raw: string, depth: number): ParsedCritique | null {
  try {
    const json = fixTrailingCommas(extractJson(stripMarkdownFences(raw)))
    const obj = JSON.parse(json) as Record<string, unknown>
    return fromObject(obj, depth)
  } catch {
    return null
  }
}

/**
 * Parse a model's critique reply into items + summary. Reuses the review
 * parser's fence-stripping and JSON extraction, and transparently unwraps the
 * per-CLI JSON envelopes (claude `result`, grok `text`, gemini `response`).
 * Never throws — a non-JSON or malformed reply yields empty items and a
 * diagnostic summary, so one bad channel can't abort the whole critique.
 */
export function parseCritiqueOutput(raw: string): ParsedCritique {
  const parsed = parseAtDepth(raw, 2)
  if (parsed) return parsed
  return { items: [], summary: 'Failed to parse critique output: no items found' }
}
