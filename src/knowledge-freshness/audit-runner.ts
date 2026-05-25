import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { extractKBFrontmatter } from '../core/assembly/knowledge-loader.js'
import { getPackageRoot } from '../utils/fs.js'

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
}

export async function runEntryAudit(
  entryPath: string,
  dispatch: Dispatcher,
  opts: RunEntryAuditOptions = {},
): Promise<AuditVerdict> {
  const content = fs.readFileSync(entryPath, 'utf8')
  const fm = extractKBFrontmatter(content)
  if (!fm) throw new Error(`could not parse frontmatter at ${entryPath}`)

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
  }
  const filled = promptTemplate.replace(
    /\{\{(entry_path|entry_frontmatter|entry_body)\}\}/g,
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
  return verdict
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
function findFirstMatchingJson<T>(s: string, schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }): T | undefined {
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
