import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractModelJson } from './cli-envelope.js'
import type {
  ReconciledCritiqueItem, CritiqueSynthesis, CritiqueSplit, CritiqueSplitPosition,
} from '../types/critique.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_PATH = resolve(__dirname, '../../templates/critique-synthesis-prompt.md')

let cachedTemplate: string | undefined
function loadTemplate(): string {
  if (cachedTemplate === undefined) cachedTemplate = readFileSync(TEMPLATE_PATH, 'utf-8')
  return cachedTemplate
}

const EMPTY: CritiqueSynthesis = { splits: [], synthesis: '' }

/** A runner that takes a prompt and returns the model's raw stdout. */
export type SynthesisRunner = (prompt: string) => Promise<string>

/** Compact item view handed to the synthesizer (no shingles/internal fields). */
function itemForPrompt(item: ReconciledCritiqueItem): Record<string, unknown> {
  return {
    id: item.id, kind: item.kind, theme: item.theme, observation: item.observation,
    ...(item.recommendation ? { recommendation: item.recommendation } : {}),
    sources: item.sources, agreement: item.agreement,
  }
}

export function assembleSynthesisPrompt(items: ReconciledCritiqueItem[]): string {
  const payload = JSON.stringify(items.map(itemForPrompt), null, 2)
  return `${loadTemplate()}\n\n## Reconciled critique items\n\`\`\`json\n${payload}\n\`\`\``
}

function validatePosition(raw: unknown): CritiqueSplitPosition | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const stance = typeof r.stance === 'string' ? r.stance.trim() : ''
  if (!stance) return null
  return {
    stance,
    item_ids: Array.isArray(r.item_ids) ? r.item_ids.filter((x): x is string => typeof x === 'string') : [],
    sources: Array.isArray(r.sources) ? r.sources.filter((x): x is string => typeof x === 'string') : [],
  }
}

function validateSplit(raw: unknown): CritiqueSplit | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const positions = Array.isArray(r.positions)
    ? r.positions.map(validatePosition).filter((p): p is CritiqueSplitPosition => p !== null)
    : []
  // A real split needs at least two opposing positions.
  if (positions.length < 2) return null
  return {
    theme: typeof r.theme === 'string' && r.theme.trim() ? r.theme.trim() : 'general',
    positions,
    crux: typeof r.crux === 'string' ? r.crux.trim() : '',
  }
}

/** Parse the synthesizer's reply (incl. CLI envelopes). Never throws. */
export function parseSynthesisOutput(raw: string): CritiqueSynthesis {
  const obj = extractModelJson(raw)
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return { ...EMPTY }
  const record = obj as Record<string, unknown>
  const splits = Array.isArray(record.splits)
    ? record.splits.map(validateSplit).filter((s): s is CritiqueSplit => s !== null)
    : []
  const synthesis = typeof record.synthesis === 'string' ? record.synthesis.trim() : ''
  return { splits, synthesis }
}

/**
 * Run the editorial synthesis pass (D6). Skips (returns empty) when there are
 * fewer than two items or no runner; degrades gracefully if the runner fails.
 * The runner is injected so the command can wire a real `claude -p` dispatch
 * while tests pass a fake.
 */
export async function synthesizeCritique(
  items: ReconciledCritiqueItem[],
  runner?: SynthesisRunner,
): Promise<CritiqueSynthesis> {
  if (items.length < 2 || !runner) return { ...EMPTY }
  try {
    const raw = await runner(assembleSynthesisPrompt(items))
    return parseSynthesisOutput(raw)
  } catch {
    return { ...EMPTY }
  }
}
