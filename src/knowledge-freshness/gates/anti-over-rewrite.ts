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
 * Parse a unified diff into per-file add/remove counts. Returns raw counts;
 * body-only counts are derived later by `splitChurnByRegion` because they
 * require access to the post-change file content (to know where the
 * frontmatter ends).
 *
 * Round-7 F-001 replaces the round-6 state-machine approach (which
 * incorrectly flipped on the FIRST `---` line — i.e., the opening
 * boundary — instead of the second / closing one, miscounting most
 * frontmatter as body churn). The line-number-based filter in
 * splitChurnByRegion is more robust because it relies on the actual
 * file content, not on diff-content patterns.
 */
export function parseUnifiedDiffForChurn(diff: string): ChurnDiffResult[] {
  const perFileHunks = parseHunks(diff)
  const out: ChurnDiffResult[] = []
  for (const [file, hunks] of perFileHunks) {
    let added = 0, removed = 0
    for (const h of hunks) {
      for (const line of h.lines) {
        if (line.startsWith('+') && !line.startsWith('+++')) added++
        else if (line.startsWith('-') && !line.startsWith('---')) removed++
      }
    }
    out.push({
      file,
      addedCount: added, removedCount: removed,
      // bodyAdded/Removed left at zero here; the caller calls
      // splitChurnByRegion() with the new-file content to fill them in.
      bodyAddedCount: 0, bodyRemovedCount: 0,
    })
  }
  return out
}

interface Hunk { newStart: number; oldStart: number; lines: string[] }

function parseHunks(diff: string): Map<string, Hunk[]> {
  const out = new Map<string, Hunk[]>()
  const lines = diff.split('\n')
  let i = 0
  let currentFile: string | null = null
  let currentHunks: Hunk[] = []
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('diff --git ')) {
      if (currentFile) out.set(currentFile, currentHunks)
      const m = line.match(/^diff --git a\/(.+) b\/(.+)$/)
      const file = m ? m[2] : ''
      currentFile = (file.startsWith('content/knowledge/') && file.endsWith('.md')) ? file : null
      currentHunks = []
      i++
      continue
    }
    if (currentFile && line.startsWith('@@')) {
      const hh = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)?/)
      if (!hh) { i++; continue }
      const hunk: Hunk = {
        oldStart: parseInt(hh[1], 10),
        newStart: parseInt(hh[2], 10),
        lines: [],
      }
      i++
      while (i < lines.length && !lines[i].startsWith('@@') && !lines[i].startsWith('diff --git ')) {
        hunk.lines.push(lines[i])
        i++
      }
      currentHunks.push(hunk)
      continue
    }
    i++
  }
  if (currentFile) out.set(currentFile, currentHunks)
  return out
}

/**
 * Per-file content pair used by `splitChurnByRegion` to derive separate
 * frontmatter boundaries for added (new file) and removed (old file)
 * sides of the diff. Round-8 F-003 introduced the asymmetry: when
 * audit-apply ADDS frontmatter fields (hash / retrieved on first audit),
 * the new frontmatter is taller than the old, so using the new boundary
 * for `-` lines mis-classifies the first body lines as frontmatter and
 * under-counts removal churn.
 */
export interface ChurnFileContent {
  /** Post-change file content (the head / working-tree version). */
  newContent: string
  /** Pre-change file content (the base / origin/main version). Optional. */
  oldContent?: string
}

/**
 * Given the raw diff and per-file pre/post-change content, return body-only
 * add/remove counts. An added line is "body" iff its new-file line number
 * is past the NEW frontmatter end; a removed line is "body" iff its
 * old-file line number is past the OLD frontmatter end.
 */
export function splitChurnByRegion(
  diff: string,
  fileContents: Map<string, ChurnFileContent | string>,
): Map<string, { bodyAddedCount: number; bodyRemovedCount: number }> {
  const perFile = parseHunks(diff)
  const out = new Map<string, { bodyAddedCount: number; bodyRemovedCount: number }>()
  for (const [file, hunks] of perFile) {
    const entry = fileContents.get(file)
    let newContent = ''
    let oldContent: string | undefined
    if (typeof entry === 'string') {
      // Back-compat shape: just the new content. Old boundary unknown;
      // we'll fall back to the new boundary for `-` lines (round-8 F-003
      // documented residual: this is the over-count direction, never
      // under-count — safe).
      newContent = entry
    } else if (entry) {
      newContent = entry.newContent
      oldContent = entry.oldContent
    }
    const newFmEnd = findFrontmatterEndLineNumber(newContent)
    const oldFmEnd = oldContent !== undefined
      ? findFrontmatterEndLineNumber(oldContent)
      : newFmEnd
    let bodyAdded = 0, bodyRemoved = 0
    for (const hunk of hunks) {
      // Walk through the hunk, tracking the running line number on each
      // side. Context lines (' ') advance both sides. '+' advances only
      // the new side. '-' advances only the old side.
      let newLineNo = hunk.newStart
      let oldLineNo = hunk.oldStart
      for (const l of hunk.lines) {
        if (l.startsWith('+') && !l.startsWith('+++')) {
          if (newLineNo > newFmEnd) bodyAdded++
          newLineNo++
        } else if (l.startsWith('-') && !l.startsWith('---')) {
          if (oldLineNo > oldFmEnd) bodyRemoved++
          oldLineNo++
        } else if (l.startsWith(' ') || l === '') {
          // Round-9 F-001: empty diff lines (where trailing whitespace was
          // stripped from a blank context line) must still advance both
          // counters. Without this, line numbers drift mid-hunk and the
          // body/frontmatter classification breaks.
          newLineNo++
          oldLineNo++
        }
        // \ No newline at end of file → no line numbers consumed.
      }
    }
    out.set(file, { bodyAddedCount: bodyAdded, bodyRemovedCount: bodyRemoved })
  }
  return out
}

/**
 * Return the 1-indexed line number of the closing frontmatter `---`. If
 * the file has no frontmatter or it's malformed, returns 0 so every
 * line is treated as body.
 */
function findFrontmatterEndLineNumber(content: string): number {
  const lines = content.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return 0
  for (let n = 1; n < lines.length; n++) {
    if (lines[n].trim() === '---') return n + 1 // 1-indexed
  }
  return 0
}
