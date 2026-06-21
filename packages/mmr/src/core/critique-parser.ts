import { extractModelJson } from './cli-envelope.js'
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
 * Parse a model's critique reply into items + summary. Reuses the shared
 * envelope extractor (so the per-CLI wrappers are transparently unwrapped) and
 * never throws — a non-JSON or malformed reply yields empty items and a
 * diagnostic summary, so one bad channel can't abort the whole critique.
 */
export function parseCritiqueOutput(raw: string): ParsedCritique {
  const obj = extractModelJson(raw)
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { items: [], summary: 'Failed to parse critique output: no items found' }
  }
  const record = obj as Record<string, unknown>
  const rawItems = Array.isArray(record.items) ? record.items : []
  const items = rawItems.map(validateItem).filter((i): i is CritiqueItem => i !== null)
  const summary = typeof record.summary === 'string' ? record.summary : ''
  if (items.length === 0 && !summary) {
    return { items: [], summary: 'Failed to parse critique output: no items found' }
  }
  return { items, summary }
}
