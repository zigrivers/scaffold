import yaml from 'js-yaml'
import type { AuditVerdict } from './audit-runner.js'

/** Valid target heading: exactly H2. */
const TARGET_HEADING_RE = /^##\s+/
/** Boundary heading: stop the section at the next H2 OR any H1 (in case the entry has one). */
const BOUNDARY_HEADING_RE = /^#{1,2}\s+/

/** Locate a markdown heading line. `location` must be the exact heading text (e.g. "## Deep Guidance"). */
function findHeading(body: string, location: string): { start: number; end: number } | null {
  const target = location.trim()
  if (!TARGET_HEADING_RE.test(target)) return null
  const lines = body.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === target) {
      // Region ends at the next H2 or H1 boundary, whichever comes first.
      // (Knowledge entries don't usually have H1s — the title is in
      // frontmatter — but if one appears we must not swallow it.)
      let j = i + 1
      while (j < lines.length && !BOUNDARY_HEADING_RE.test(lines[j])) j++
      return { start: i, end: j }
    }
  }
  return null
}

/** Strip a URL fragment/anchor so verdict sources match frontmatter sources reliably. */
export function normalizeUrl(u: string): string {
  const idx = u.indexOf('#')
  return idx === -1 ? u : u.slice(0, idx)
}

/** Headings the assembly engine depends on — apply must preserve them verbatim. */
const PROTECTED_HEADINGS = new Set(['## Summary', '## Deep Guidance'])

export interface ApplyOptions {
  /**
   * Optional map of normalized-url → fresh sha256 hash, computed deterministically
   * by the caller (typically the CLI wrapper, which re-fetches each
   * `verdict.sources_checked.url` before calling apply). When provided, these
   * hashes are persisted to frontmatter instead of the LLM-claimed
   * `content_hash` (which is not deterministically verifiable). When omitted —
   * e.g. in unit tests — apply falls back to the LLM-claimed hash.
   */
  trustedHashes?: Map<string, string>
}

export function applyVerdictToEntry(
  original: string,
  verdict: AuditVerdict,
  opts: ApplyOptions = {},
): string {
  // Enforce the spec contract: minor-drift carries findings only, no changes.
  if ((verdict.verdict === 'current' || verdict.verdict === 'minor-drift') && verdict.proposed_changes.length > 0) {
    throw new Error(
      `verdict "${verdict.verdict}" must have no proposed_changes — got ${verdict.proposed_changes.length}. ` +
      'Use "major-drift" or "superseded" if changes are needed (also gates MMR corroboration per spec §A.4).',
    )
  }

  const lines = original.split('\n')
  if (lines[0]?.trim() !== '---') throw new Error('entry has no frontmatter')
  let close = -1
  for (let i = 1; i < lines.length; i++) if (lines[i].trim() === '---') { close = i; break }
  if (close === -1) throw new Error('frontmatter unclosed')

  // Parse frontmatter with a safe schema so ISO dates stay strings (round-1 F-001).
  const fmObj = yaml.load(lines.slice(1, close).join('\n'), { schema: yaml.JSON_SCHEMA }) as Record<string, unknown>

  // Before advancing `last-reviewed`, verify the verdict covers every declared
  // source. A verdict that's missing one of the entry's sources implies the
  // audit didn't fetch it — marking the entry reviewed in that state would
  // leave the source un-checked AND skip it from the prefilter until cadence
  // expires (round-2 F-002).
  //
  // Coverage is ANCHOR-AWARE (round-5 F-002): if a frontmatter source carries
  // an `anchor`, the verdict URL must match `url + anchor` exactly. Without
  // this, an entry with two sources at the same base URL but different
  // anchors (`#a` vs `#b`) could be partially audited yet treated as fully
  // covered. Sources without an anchor still match leniently — a verdict URL
  // that happens to carry a fragment counts.
  if (Array.isArray(fmObj['sources'])) {
    const sourcesArr = fmObj['sources'] as Array<{ url?: string; anchor?: string; hash?: string; retrieved?: string }>
    for (const s of sourcesArr) {
      if (!s.url) continue
      const url = s.url
      const anchor = typeof s.anchor === 'string' ? s.anchor : ''
      const hasAnchor = anchor.length > 0
      const covered = hasAnchor
        ? verdict.sources_checked.some((c) => c.url === url + anchor)
        : verdict.sources_checked.some((c) => normalizeUrl(c.url) === normalizeUrl(url))
      if (!covered) {
        const target = hasAnchor ? url + anchor : url
        throw new Error(
          `verdict.sources_checked is missing entry source "${target}" — ` +
          'refusing to advance last-reviewed when the audit did not cover every declared source. ' +
          'Either the audit failed for that source (rerun) or the verdict is malformed.',
        )
      }
    }
  }

  fmObj['last-reviewed'] = verdict.audit_date

  if (Array.isArray(fmObj['sources'])) {
    const sourcesArr = fmObj['sources'] as Array<{ url?: string; hash?: string; retrieved?: string }>
    for (const s of sourcesArr) {
      // Normalize both sides so a frontmatter `url: https://x` matches a verdict
      // `url: https://x#fragment` (round-3 F-002).
      const sNormalized = s.url ? normalizeUrl(s.url) : undefined
      const match = verdict.sources_checked.find(c => normalizeUrl(c.url) === sNormalized)
      if (match) {
        const matchNormalized = normalizeUrl(match.url)
        if (opts.trustedHashes !== undefined) {
          // Strict mode: caller has taken responsibility for deterministic hashing.
          // A missing URL means the deterministic fetch failed for it — refuse to
          // persist the LLM-claimed hash as a silent fallback (round-4 F-003).
          const fresh = opts.trustedHashes.get(matchNormalized)
          if (fresh === undefined) {
            throw new Error(
              `trustedHashes was supplied but did not include "${matchNormalized}" — ` +
              'the CLI should compute hashes for every verdict.sources_checked URL before calling apply.',
            )
          }
          s.hash = fresh
        } else {
          // Test mode (or callers that explicitly accept LLM-claimed hashes):
          // fall back to the LLM-claimed value.
          s.hash = match.content_hash
        }
        s.retrieved = match.retrieved_at
      }
    }
  }

  const newFm = yaml.dump(fmObj, { lineWidth: 120, schema: yaml.JSON_SCHEMA }).trimEnd()
  let body = lines.slice(close + 1).join('\n')

  for (const change of verdict.proposed_changes) {
    // Protect headings the assembly engine depends on (round-3 F-004 extends F-002
    // to cover ## Summary as well as ## Deep Guidance, matching the meta-prompt).
    const loc = change.location.trim()
    if (PROTECTED_HEADINGS.has(loc)) {
      if (change.kind === 'delete') {
        throw new Error(`refusing to delete "${loc}" — assembly engine depends on it`)
      }
      if (change.kind === 'replace') {
        // First non-empty line of new_text must be EXACTLY the protected heading.
        // `extractDeepGuidance()` matches `/^## Deep Guidance\s*$/i` — a near-miss
        // like "## Deep Guidance (Updated)" still starts with the prefix but
        // would break the assembly path (round-6 F-001).
        // Trim leading blank lines first so a model that emits "\n## …" still
        // passes (round-14 F-002); only the first non-empty line matters.
        const firstLine = (change.new_text ?? '').split('\n').map(l => l.trim()).find(l => l !== '') ?? ''
        if (firstLine !== loc) {
          throw new Error(
            `refusing to alter "${loc}" heading in a replace — new_text's first non-empty line ` +
            `must equal "${loc}" exactly (got "${firstLine}")`,
          )
        }
      }
    }

    const region = findHeading(body, change.location)
    if (!region) {
      // Throw rather than silently advance `last-reviewed` on a failed apply (F-002, F-010).
      throw new Error(`proposed_change.location "${change.location}" did not match any "## …" heading in the entry`)
    }
    const bodyLines = body.split('\n')
    const before = bodyLines.slice(0, region.start)
    const after = bodyLines.slice(region.end)

    // Splice helper — guarantees a blank line between each chunk so we don't
    // glue inserted text directly onto the next "## " heading (round-4 F-005).
    const splice = (...chunks: string[][]): string => {
      const padded: string[] = []
      for (const chunk of chunks) {
        if (chunk.length === 0) continue
        if (padded.length > 0 && padded[padded.length - 1] !== '') padded.push('')
        padded.push(...chunk)
      }
      return padded.join('\n')
    }

    if (change.kind === 'replace') {
      if (!change.new_text) throw new Error(`replace change at "${change.location}" missing new_text`)
      // Verbatim splice instead of String.replace to avoid `$&`/`$1`/`$$` interpolation in new_text (F-004).
      const replacement = change.new_text.trim().split('\n')
      body = splice(before, replacement, after)
    } else if (change.kind === 'insert') {
      if (!change.new_text) throw new Error(`insert change at "${change.location}" missing new_text`)
      const originalRegion = bodyLines.slice(region.start, region.end)
      const insertion = change.new_text.trim().split('\n')
      body = splice(before, originalRegion, insertion, after)
    } else if (change.kind === 'delete') {
      // Remove the section entirely, including its heading line (F-003).
      body = splice(before, after)
    }
  }

  return `---\n${newFm}\n---\n${body}`
}
