/**
 * Anti-over-rewrite gate (spec §A.5): for `volatility: stable` entries, fail
 * if the diff's add+remove line count exceeds 20% of the entry's total line
 * count. For `evolving` and `fast-moving` entries we still compute the churn
 * percentage and surface it as a notice, but never fail.
 *
 * The override is a maintainer-applied PR label `override:anti-over-rewrite`
 * — NOT a PR-body marker. F-005 (round-1 Phase 2 MMR review): a marker in
 * the PR body could be prompt-injected via LLM-generated verdict text from
 * a malicious source. Labels are applied by GitHub users with write access,
 * so they're trustworthy.
 */
import { parseEntry } from './parse-entry.js'

const STABLE_THRESHOLD = 0.20
const OVERRIDE_LABEL = 'override:anti-over-rewrite'

export interface ChurnInput {
  file: string
  /** Raw post-change file contents (used to read volatility + total lines). */
  content: string
  /** Added lines from the diff for this file (entire file). */
  addedCount: number
  /** Removed lines from the diff for this file (entire file). */
  removedCount: number
  /** Added lines from the diff that are in the BODY (post-frontmatter) region. */
  bodyAddedCount?: number
  /** Removed lines from the diff that are in the BODY (post-frontmatter) region. */
  bodyRemovedCount?: number
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
  /**
   * Labels currently applied to the PR. The gate honors the literal label
   * `override:anti-over-rewrite` (F-005). PR-body markers are explicitly
   * NOT honored because the bot can write the body but cannot apply labels.
   */
  prLabels?: string[]
}

export function evaluateChurn(inputs: ChurnInput[], opts: ChurnOptions = {}): ChurnFinding[] {
  const overridden = Array.isArray(opts.prLabels) && opts.prLabels.includes(OVERRIDE_LABEL)
  const out: ChurnFinding[] = []
  for (const input of inputs) {
    let volatility: ChurnFinding['volatility'] = null
    let bodyLines = input.content.split('\n').length
    try {
      const parsed = parseEntry(input.content)
      volatility = parsed.volatility
      bodyLines = parsed.body.split('\n').length
    } catch { /* missing FM → null volatility; bodyLines stays as full file */ }
    // Round-6 F-002: the 20% threshold applies to BODY churn only. A
    // `current` verdict refreshes 3 frontmatter fields (~6 lines of diff)
    // and touches no body — without excluding frontmatter changes, a
    // stable entry under ~30 lines would trip the threshold on every
    // metadata-only refresh PR. The diff parser exposes bodyAdded/Removed
    // alongside the total counts so we can compute the right denominator
    // and numerator here.
    const bodyAdded = input.bodyAddedCount ?? input.addedCount
    const bodyRemoved = input.bodyRemovedCount ?? input.removedCount
    const totalLines = input.content.split('\n').length
    const totalBodyChurn = bodyAdded + bodyRemoved
    const churnPct = bodyLines > 0 ? totalBodyChurn / bodyLines : 0
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
  bodyAddedCount: number
  bodyRemovedCount: number
}

/**
 * Parse a unified diff into per-file add/remove counts AND body-only
 * counts (excluding frontmatter changes). Round-6 F-002 requires the
 * body-only counts so a metadata-only refresh PR (frontmatter dates +
 * hashes updating) doesn't trip the stable-entry 20% threshold.
 *
 * Frontmatter detection inside a hunk uses two signals:
 *   1. Hunk header @@ -A,B +C,D @@: if new-file start C == 1, we're
 *      entering the frontmatter region (line 1 of a valid entry is `---`).
 *   2. Within a hunk, every `---` content line toggles inside ↔ after.
 * Hunks that start past the frontmatter end (newStart > 1) are assumed
 * to be in body region for the entire hunk.
 */
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
      let added = 0, removed = 0
      let bodyAdded = 0, bodyRemoved = 0
      // 'inside': currently within the frontmatter --- ... --- block.
      // 'after':  past the closing --- (i.e., in body region).
      // Default to 'after'; hunk headers may flip us back to 'inside'.
      let state: 'inside' | 'after' = 'after'
      while (i < lines.length && !lines[i].startsWith('diff --git ')) {
        const l = lines[i]
        if (l.startsWith('@@')) {
          // @@ -A,B +C,D @@ — parse new-file start C.
          const hh = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)?/)
          if (hh && parseInt(hh[1], 10) === 1) {
            state = 'inside'
          } else {
            state = 'after'
          }
          i++
          continue
        }
        const isAdded = l.startsWith('+') && !l.startsWith('+++')
        const isRemoved = l.startsWith('-') && !l.startsWith('---')
        const isContext = l.startsWith(' ')
        if (isAdded) added++
        else if (isRemoved) removed++
        // Count BODY churn only when not inside frontmatter. The `---`
        // delimiter line itself is metadata, not body.
        const contentLine = (isAdded || isRemoved || isContext) ? l.slice(1) : null
        if (state === 'after' && contentLine !== '---') {
          if (isAdded) bodyAdded++
          if (isRemoved) bodyRemoved++
        }
        // Toggle on --- boundary AFTER classifying the line itself.
        if (contentLine === '---') {
          state = state === 'inside' ? 'after' : 'inside'
        }
        i++
      }
      out.push({
        file,
        addedCount: added, removedCount: removed,
        bodyAddedCount: bodyAdded, bodyRemovedCount: bodyRemoved,
      })
    } else {
      i++
    }
  }
  return out
}
