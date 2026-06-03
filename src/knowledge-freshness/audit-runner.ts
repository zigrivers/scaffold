import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { extractKBFrontmatter } from '../core/assembly/knowledge-loader.js'
import { getPackageRoot } from '../utils/fs.js'
import { defaultResolver, type Resolver } from './source-url-validator.js'
import { fetchAndHash, type FetchImpl } from './source-hash.js'
import { todayUtcYmd } from './today.js'

/**
 * Max body bytes injected per source. Caps prompt size and keeps a malicious
 * giant response from blowing the context window. 96 KiB is comfortably
 * larger than current targets (OWASP Top 10 page ≈ 50 KiB).
 */
const MAX_SOURCE_BODY_BYTES = 96 * 1024

export type Dispatcher = (prompt: string) => Promise<string>

const verdictSchema = z.object({
  entry_name: z.string(),
  audit_date: z.string(),
  model: z.string(),
  verdict: z.enum(['current', 'minor-drift', 'major-drift', 'superseded']),
  sources_checked: z.array(z.object({
    url: z.string().url(), retrieved_at: z.string(),
    content_hash: z.string(), summary: z.string(),
  })),
  findings: z.array(z.object({
    claim_in_entry: z.string(), evidence_url: z.string().url(),
    evidence_date: z.string(), source_excerpt: z.string(),
    severity: z.enum(['P0', 'P1', 'P2', 'P3']),
    drift_kind: z.string(),
  })),
  proposed_changes: z.array(z.object({
    location: z.string(), kind: z.enum(['replace', 'insert', 'delete']),
    rationale: z.string(), new_text: z.string().optional(),
  })),
  preserve_warnings: z.array(z.string()),
})

export type AuditVerdict = z.infer<typeof verdictSchema>

export interface RunEntryAuditOptions {
  /** Override the meta-prompt path. Defaults to the bundled `content/tools/knowledge-audit-entry.md`. */
  promptPath?: string
  /** Override the DNS resolver used for the rebinding guard (round-5 F-001). Default: Node `dns.promises`. */
  resolver?: Resolver
  /** Override the fetch implementation. Tests inject a mock. Default: undici fetch via fetchAndHash. */
  fetchImpl?: FetchImpl
  /**
   * Skip prefetching source bodies. Used only by tests that supply fixture
   * URLs which aren't expected to resolve (e.g. `https://x`) and don't care
   * about the prefetched-sources payload. Defaults to running the prefetch.
   */
  skipPrefetch?: boolean
  /**
   * Override "now" for date stamping. Tests pin this for determinism; in
   * production it defaults to the real current date. See `stampVerdictRunDates`.
   */
  now?: Date
}

export async function runEntryAudit(
  entryPath: string,
  dispatch: Dispatcher,
  opts: RunEntryAuditOptions = {},
): Promise<AuditVerdict> {
  const content = fs.readFileSync(entryPath, 'utf8')
  const fm = extractKBFrontmatter(content)
  if (!fm) throw new Error(`could not parse frontmatter at ${entryPath}`)

  // SECURITY (round-6 F-001): the entry body is author-controlled. If the
  // subprocess had WebFetch enabled, a prompt-injected body could direct it
  // at arbitrary URLs — bypassing every Node-side URL guard, because the
  // attacker URL never came through the declared sources array.
  //
  // Mitigation: pre-fetch source bodies in Node, where the SSRF / DNS /
  // redirect-hop / timeout guards apply, and embed the bodies into the
  // prompt. The model runs with NO tools (`--tools ""` set by the CLI
  // wrapper). The only way to "fetch a URL" is to declare it in the entry's
  // frontmatter sources — and those go through the guards.
  //
  // TOCTOU still possible between Node fetch and any future subprocess fetch,
  // but a no-tools model can't re-fetch at all, so the window collapses to
  // zero. The Phase 2 "constrained fetch tool with pre-validated IDs" idea
  // can re-introduce WebFetch later if needed.
  const resolver = opts.resolver ?? defaultResolver
  interface PrefetchedSource { url: string; body: string; hash: string; truncated: boolean }
  const prefetched: PrefetchedSource[] = []
  if (!opts.skipPrefetch) {
    for (const s of fm.sources) {
      const targetUrl = s.url + (s.anchor ?? '')
      const { body, hash } = await fetchAndHash(targetUrl, { resolver, fetchImpl: opts.fetchImpl })
      const truncated = body.length > MAX_SOURCE_BODY_BYTES
      prefetched.push({
        url: targetUrl,
        body: truncated ? body.slice(0, MAX_SOURCE_BODY_BYTES) : body,
        hash,
        truncated,
      })
    }
  }

  // Re-emit the frontmatter with the same hyphenated keys the meta-prompt
  // describes (`last-reviewed`, `version-pin`). The parser's TS-side shape
  // is camelCase; the prompt and the on-disk YAML are hyphenated, and the
  // model is told to expect hyphenated keys.
  const fmForPrompt = {
    name: fm.name,
    description: fm.description,
    topics: fm.topics,
    volatility: fm.volatility,
    'last-reviewed': fm.lastReviewed,
    'version-pin': fm.versionPin,
    sources: fm.sources,
  }

  // Resolve via the package-root helper so this works when scaffold is invoked
  // from any cwd (installed globally via npm/brew, or run from a downstream
  // project root). Pattern matches src/core/knowledge/knowledge-update-assembler.ts.
  // Tests can pass `opts.promptPath` to inject a fixture.
  const promptTemplate = fs.readFileSync(
    opts.promptPath ?? path.join(getPackageRoot(), 'content', 'tools', 'knowledge-audit-entry.md'),
    'utf8',
  )

  // Single-pass substitution prevents template-collision: if one value
  // happened to contain a later placeholder string like `{{entry_body}}`,
  // a sequential .replaceAll chain would substitute into the substituted
  // content. The single regex over all placeholders sidesteps that — each
  // match site is resolved against the original template once.
  // Replacer-function form also avoids String.replace's special-pattern
  // handling (`$$`, `$&`, `$'`, `$1`) on values containing dollar signs.
  const substitutions: Record<string, string> = {
    '{{entry_path}}': entryPath,
    '{{entry_frontmatter}}': JSON.stringify(fmForPrompt, null, 2),
    '{{entry_body}}': content,
    '{{prefetched_sources}}': JSON.stringify(prefetched, null, 2),
  }
  const filled = promptTemplate.replace(
    /\{\{(entry_path|entry_frontmatter|entry_body|prefetched_sources)\}\}/g,
    (match) => substitutions[match] ?? match,
  )

  const raw = await dispatch(filled)
  const verdict = findFirstMatchingJson(raw, verdictSchema)
  if (verdict === undefined) {
    throw new Error(
      'audit output contained no JSON object matching the verdict schema. ' +
      'Check that the dispatcher returned the meta-prompt\'s expected shape.',
    )
  }
  // The meta-prompt has the model emit the literal `PENDING` for audit_date /
  // retrieved_at — it cannot know the real date, and earlier (when asked for
  // "today's date") it emitted plausible-but-wrong values anchored near its
  // training cutoff, varying run-to-run. Overwrite both with the actual run
  // date so `last-reviewed` / `retrieved` provenance — and the cadence
  // prefilter that keys off them — are truthful and deterministic.
  return stampVerdictRunDates(normalizeVerdict(verdict), todayUtcYmd(opts?.now))
}

/**
 * Replace the LLM-claimed `audit_date` and every `sources_checked[].retrieved_at`
 * with the harness-measured run date (`ymd`, a UTC YYYY-MM-DD). Every source is
 * fetched during this single audit run, so they all share the run date. Other
 * fields — including each finding's `evidence_date`, which describes the
 * external evidence rather than our review — are left untouched.
 */
export function stampVerdictRunDates(verdict: AuditVerdict, ymd: string): AuditVerdict {
  return {
    ...verdict,
    audit_date: ymd,
    sources_checked: verdict.sources_checked.map((s) => ({ ...s, retrieved_at: ymd })),
  }
}

/**
 * Make a verdict self-consistent with the spec contract (enforced in
 * audit-apply.ts; spec §A.4): `current` and `minor-drift` carry findings only,
 * never edits. A non-conforming
 * model — observed with DeepSeek, which follows the constraint less strictly
 * than Claude — can return `proposed_changes` alongside one of those verdicts.
 * Hard-failing there leaves the entry perpetually "due" and starves the
 * 10-entry daily audit budget. Instead, demote the changes to advisory
 * `preserve_warnings` so the verdict applies cleanly and the entry gets
 * reviewed-stamped. Demoting (not upgrading to major-drift) is deliberate:
 * upgrading would push unexpected rewrites of stable entries through, bypassing
 * the MMR-corroboration and anti-over-rewrite gates that major-drift requires.
 */
export function normalizeVerdict(verdict: AuditVerdict): AuditVerdict {
  // Defensive: although runEntryAudit's Zod parse guarantees these arrays,
  // this function is exported as the sanitizer for non-conforming output, so
  // it must tolerate a hand-built verdict that omits them rather than throw.
  const proposed = verdict.proposed_changes ?? []
  const carriesNoEdits = verdict.verdict === 'current' || verdict.verdict === 'minor-drift'
  if (!carriesNoEdits || proposed.length === 0) return verdict

  const demoted = proposed.map(
    (c) => `[demoted from proposed_changes — ${verdict.verdict} carries no edits] ${c.location}: ${c.rationale}`,
  )
  process.stderr.write(
    `[audit-runner] verdict "${verdict.verdict}" returned ${proposed.length} ` +
    'proposed_changes; demoting to preserve_warnings (advisory) per spec contract.\n',
  )
  return {
    ...verdict,
    proposed_changes: [],
    preserve_warnings: [...(verdict.preserve_warnings ?? []), ...demoted],
  }
}

/**
 * Walk `s` looking for balanced `{...}` blocks (respecting JSON string literals),
 * JSON.parse each, and return the first whose parse passes the given Zod schema.
 * Robust against model preamble/postamble that contains brace-like noise
 * (round-6 F-002), invalid braced text (round-7 F-001), or earlier parseable
 * but schema-mismatched objects like a `{"thinking": …}` block (round-8 F-001).
 *
 * NB: this is NOT a copy of `extractJsonObject` in
 * `src/observability/engine/llm-dispatcher.ts`. That helper walks last→first
 * and is schema-unaware — it returns the first parseable object found, which
 * is wrong for our use case (a thinking-shaped object emitted before the
 * verdict would short-circuit). The schema-threaded walk here is the
 * round-8 fix and cannot be reduced to reusing that helper without losing
 * the protection. If/when the dispatcher's helper gains a schema predicate,
 * collapse this into a shared utility.
 */
type SafeParser<T> = { safeParse: (v: unknown) => { success: boolean; data?: T } }

function findFirstMatchingJson<T>(s: string, schema: SafeParser<T>): T | undefined {
  const tryCandidate = (candidate: string): T | undefined => {
    let parsed: unknown
    try { parsed = JSON.parse(candidate) } catch { return undefined }
    const result = schema.safeParse(parsed)
    return result.success ? result.data : undefined
  }

  for (let start = 0; start < s.length; start++) {
    if (s[start] !== '{') continue
    let depth = 0
    let inString = false
    let escaped = false
    for (let i = start; i < s.length; i++) {
      const ch = s[i]
      if (escaped) { escaped = false; continue }
      if (inString) {
        if (ch === '\\') { escaped = true; continue }
        if (ch === '"') inString = false
        continue
      }
      if (ch === '"') { inString = true; continue }
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          const hit = tryCandidate(s.slice(start, i + 1))
          if (hit !== undefined) return hit
          break // skip past this candidate; outer loop continues at start+1
        }
      }
    }
  }
  // The forward-walk scans every balanced {...} block in the response and
  // try-parses each. A separate "strip ```json fences and try once more"
  // fallback was considered, but the inner JSON inside a fence pair is
  // itself a balanced {...} block that the primary loop already finds —
  // the fallback was dead code in practice. If nothing matched, the
  // dispatcher response is too degenerate to recover.
  return undefined
}
