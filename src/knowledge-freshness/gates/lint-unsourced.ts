/**
 * Advisory lint: scans a unified diff for ADDED lines in
 * `content/knowledge/**\/*.md` that read like normative claims and don't have
 * a nearby markdown link to a domain present in the entry's declared
 * `sources:`. Emits one warning per offending line. Spec §A.5 explicitly says
 * "Heuristic, advisory; flags for review, doesn't block" — never returns a
 * non-OK status.
 */
import { parseEntry } from './parse-entry.js'

/** Whole-word match for normative-claim keywords (case-insensitive). */
const NORMATIVE_RE = /\b(must|should|never|always)\b/i

const NEAR_LINES = 3

export interface LintFinding {
  /** Source path inside `content/knowledge/`. */
  file: string
  /** 1-based line number in the FILE (post-patch). */
  line: number
  /** Trimmed text of the offending line (no leading `+`). */
  text: string
  /** Short reason, e.g. "no source link within 3 lines". */
  reason: string
}

export interface LintInput {
  /** Path of the changed file. */
  file: string
  /** Raw file contents AFTER the change. */
  content: string
  /**
   * Added-line records from the diff: line numbers (1-based, post-patch) and
   * the line text WITHOUT the leading `+`. Caller is responsible for parsing
   * the unified diff and producing this list — keeps this module pure.
   */
  addedLines: Array<{ line: number; text: string }>
}

/**
 * Extract the set of source domains (hostnames) declared in the entry's
 * frontmatter. Used to decide whether a nearby link "counts" — links to
 * arbitrary unrelated URLs don't satisfy the heuristic.
 */
function sourceDomains(content: string): Set<string> {
  try {
    const parsed = parseEntry(content)
    const out = new Set<string>()
    for (const url of parsed.sourceUrls) {
      try { out.add(new URL(url).hostname) } catch { /* ignore unparseable */ }
    }
    return out
  } catch {
    return new Set()
  }
}

/**
 * True if `line` (a markdown line) contains a `[text](http...)` link whose
 * hostname appears in `domains`.
 */
function lineHasSourceLink(line: string, domains: Set<string>): boolean {
  // Match every markdown link in the line. The regex is non-greedy on link
  // text so back-to-back links don't merge into one match.
  const re = /\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g
  for (let m = re.exec(line); m; m = re.exec(line)) {
    try {
      const h = new URL(m[1]).hostname
      if (domains.has(h)) return true
      // Accept subdomain matches so a source declared as "owasp.org" still
      // covers a citation to "cheatsheetseries.owasp.org".
      for (const d of domains) if (h.endsWith('.' + d)) return true
    } catch { /* ignore */ }
  }
  return false
}

export function lintUnsourcedClaims(inputs: LintInput[]): LintFinding[] {
  const findings: LintFinding[] = []
  for (const input of inputs) {
    if (input.addedLines.length === 0) continue
    const domains = sourceDomains(input.content)
    const fileLines = input.content.split('\n')
    for (const added of input.addedLines) {
      if (!NORMATIVE_RE.test(added.text)) continue
      // Look within ±NEAR_LINES of the offending line. `line` is 1-based.
      const lo = Math.max(0, added.line - 1 - NEAR_LINES)
      const hi = Math.min(fileLines.length - 1, added.line - 1 + NEAR_LINES)
      let found = false
      for (let i = lo; i <= hi; i++) {
        if (lineHasSourceLink(fileLines[i] ?? '', domains)) { found = true; break }
      }
      if (!found) {
        findings.push({
          file: input.file,
          line: added.line,
          text: added.text.trim(),
          reason: domains.size === 0
            ? 'normative claim added but entry declares no sources'
            : `no link to a declared source within ${NEAR_LINES} lines`,
        })
      }
    }
  }
  return findings
}

/**
 * Parse a unified diff (`git diff` output) into per-file added-line lists.
 * Only `content/knowledge/**\/*.md` paths are emitted; other files are
 * silently dropped so the caller can pipe an unfiltered diff in.
 */
export interface DiffParseResult {
  file: string
  addedLines: Array<{ line: number; text: string }>
}

export function parseUnifiedDiff(diff: string): DiffParseResult[] {
  const out: DiffParseResult[] = []
  const lines = diff.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('diff --git ')) {
      // Header form: `diff --git a/path b/path`. Use the b-side as canonical.
      const m = line.match(/^diff --git a\/(.+) b\/(.+)$/)
      const file = m ? m[2] : ''
      i++
      // Skip header lines until we hit a hunk or the next file.
      while (i < lines.length && !lines[i].startsWith('@@') && !lines[i].startsWith('diff --git ')) i++
      if (!file.startsWith('content/knowledge/') || !file.endsWith('.md')) continue
      const added: Array<{ line: number; text: string }> = []
      while (i < lines.length && !lines[i].startsWith('diff --git ')) {
        const hunk = lines[i].match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
        if (!hunk) { i++; continue }
        let curLine = Number(hunk[1])
        i++
        while (i < lines.length && !lines[i].startsWith('@@') && !lines[i].startsWith('diff --git ')) {
          const ch = lines[i].charAt(0)
          if (ch === '+' && !lines[i].startsWith('+++')) {
            added.push({ line: curLine, text: lines[i].slice(1) })
            curLine++
          } else if (ch === '-' && !lines[i].startsWith('---')) {
            // deletion — don't advance post-patch line counter
          } else if (ch === '\\') {
            // "\ No newline at end of file" — skip
          } else {
            curLine++
          }
          i++
        }
      }
      if (added.length > 0) out.push({ file, addedLines: added })
    } else {
      i++
    }
  }
  return out
}
