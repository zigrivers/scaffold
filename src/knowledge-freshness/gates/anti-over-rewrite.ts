/**
 * Anti-over-rewrite gate (spec §A.5): for `volatility: stable` entries, fail
 * if the diff's add+remove line count exceeds 20% of the entry's total line
 * count. For `evolving` and `fast-moving` entries we still compute the churn
 * percentage and surface it as a notice, but never fail. The PR description
 * can opt out for stable entries by including the literal string
 * `[override:anti-over-rewrite]` (case-sensitive, the override must be
 * explicit and grep-able).
 */
import { parseEntry } from './parse-entry.js'

const STABLE_THRESHOLD = 0.20
const OVERRIDE_MARKER = '[override:anti-over-rewrite]'

export interface ChurnInput {
  file: string
  /** Raw post-change file contents (used to read volatility + total lines). */
  content: string
  /** Added lines from the diff for this file. */
  addedCount: number
  /** Removed lines from the diff for this file. */
  removedCount: number
}

export interface ChurnFinding {
  file: string
  volatility: 'stable' | 'evolving' | 'fast-moving' | null
  totalLines: number
  addedCount: number
  removedCount: number
  churnPct: number
  /** True if this counts as a blocking failure (stable + over-threshold + no override). */
  blocking: boolean
  /** True if the PR body contained the override marker. */
  overridden: boolean
}

export interface ChurnOptions {
  /** Full PR description body, if known. Used to detect the override marker. */
  prBody?: string
}

export function evaluateChurn(inputs: ChurnInput[], opts: ChurnOptions = {}): ChurnFinding[] {
  const overridden = typeof opts.prBody === 'string' && opts.prBody.includes(OVERRIDE_MARKER)
  const out: ChurnFinding[] = []
  for (const input of inputs) {
    let volatility: ChurnFinding['volatility'] = null
    try { volatility = parseEntry(input.content).volatility } catch { /* missing FM → null */ }
    const totalLines = input.content.split('\n').length
    const total = input.addedCount + input.removedCount
    const churnPct = totalLines > 0 ? total / totalLines : 0
    const overThreshold = churnPct > STABLE_THRESHOLD
    const blocking = volatility === 'stable' && overThreshold && !overridden
    out.push({
      file: input.file,
      volatility,
      totalLines,
      addedCount: input.addedCount,
      removedCount: input.removedCount,
      churnPct,
      blocking,
      overridden: overridden && volatility === 'stable' && overThreshold,
    })
  }
  return out
}

/**
 * Parse a unified diff into per-file add/remove counts. Mirrors
 * `lint-unsourced.parseUnifiedDiff` in scope (knowledge entries only) so the
 * two gates pull the same set of files from the same diff input.
 */
export interface ChurnDiffResult {
  file: string
  addedCount: number
  removedCount: number
}

export function parseUnifiedDiffForChurn(diff: string): ChurnDiffResult[] {
  const out: ChurnDiffResult[] = []
  const lines = diff.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('diff --git ')) {
      const m = line.match(/^diff --git a\/(.+) b\/(.+)$/)
      const file = m ? m[2] : ''
      i++
      while (i < lines.length && !lines[i].startsWith('@@') && !lines[i].startsWith('diff --git ')) i++
      if (!file.startsWith('content/knowledge/') || !file.endsWith('.md')) continue
      let added = 0
      let removed = 0
      while (i < lines.length && !lines[i].startsWith('diff --git ')) {
        const l = lines[i]
        if (l.startsWith('@@')) { i++; continue }
        if (l.startsWith('+') && !l.startsWith('+++')) added++
        else if (l.startsWith('-') && !l.startsWith('---')) removed++
        i++
      }
      out.push({ file, addedCount: added, removedCount: removed })
    } else {
      i++
    }
  }
  return out
}
