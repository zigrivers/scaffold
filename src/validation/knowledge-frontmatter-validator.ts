import fs from 'node:fs'
import yaml from 'js-yaml'
import { z } from 'zod'

// Strict calendar-date refinement. A regex like /^\d{4}-\d{2}-\d{2}$/ accepts
// "2026-99-99", which then becomes NaN at `new Date(...)` and silently breaks
// cadence math in selectAuditCandidates (round-3 F-002). Require the parsed
// Date to round-trip back to the same string.
const isoDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(s + 'T00:00:00Z')
    if (Number.isNaN(d.getTime())) return false
    return d.toISOString().slice(0, 10) === s
  }, 'must be a real calendar date')

const sourceSchema = z.object({
  url: z.string().url(),
  // Anchors are appended to source.url literally by the audit meta-prompt, so
  // they must include the leading "#" to produce a valid URL fragment.
  anchor: z.string().regex(/^#/, 'anchor must start with "#"').optional(),
  retrieved: isoDateSchema.optional(),
  hash: z.string().optional(),
})

// Note: description has no max in the schema because some existing entries
// already exceed 200 chars (e.g. content/knowledge/core/automated-review-tooling.md
// is ~228). Overlong descriptions surface as a *warning* below, not an error,
// so the Phase 1 CI gate doesn't break on day one.
const kbSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9-]*$/),
  description: z.string(),
  topics: z.array(z.string()).default([]),
  volatility: z.enum(['stable', 'evolving', 'fast-moving']).default('evolving'),
  'last-reviewed': isoDateSchema.nullable().default(null),
  'version-pin': z.string().nullable().default(null),
  sources: z.array(sourceSchema).default([]),
})

const DESCRIPTION_SOFT_MAX = 200

export interface KBValidationIssue { message: string; field?: string }
export interface KBValidationResult { errors: KBValidationIssue[]; warnings: KBValidationIssue[] }

export function validateKnowledgeFile(filePath: string): KBValidationResult {
  const errors: KBValidationIssue[] = []
  const warnings: KBValidationIssue[] = []
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split('\n')
  if (lines[0]?.trim() !== '---') {
    errors.push({ message: 'missing frontmatter' })
    return { errors, warnings }
  }
  let closeIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { closeIdx = i; break }
  }
  if (closeIdx === -1) {
    errors.push({ message: 'unclosed frontmatter' })
    return { errors, warnings }
  }
  let parsed: unknown
  try { parsed = yaml.load(lines.slice(1, closeIdx).join('\n'), { schema: yaml.JSON_SCHEMA }) }
  catch (e) {
    errors.push({ message: `yaml parse error: ${(e as Error).message}` })
    return { errors, warnings }
  }
  const result = kbSchema.safeParse(parsed ?? {})
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push({ message: `${issue.path.join('.')}: ${issue.message}`, field: String(issue.path[0] ?? '') })
    }
    return { errors, warnings }
  }
  const fm = result.data
  if (fm.description.length > DESCRIPTION_SOFT_MAX) {
    warnings.push({
      message: `description is ${fm.description.length} chars (>${DESCRIPTION_SOFT_MAX}); ` +
        'consider trimming for downstream prompt token budgets',
    })
  }
  if (fm.volatility === 'fast-moving' && fm.sources.length === 0) {
    warnings.push({ message: 'fast-moving entry has empty sources — audit cannot run' })
  }
  if (!content.includes('## Deep Guidance')) {
    warnings.push({ message: 'missing "## Deep Guidance" heading — assembly engine will fall back to full body' })
  }
  return { errors, warnings }
}

export function validateKnowledgeDir(dir: string): Map<string, KBValidationResult> {
  const results = new Map<string, KBValidationResult>()
  function walk(d: string) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = `${d}/${entry.name}`
      if (entry.isDirectory()) walk(p)
      // Skip directory READMEs — the assembly engine excludes them
      // (knowledge-loader.ts:138-139, :186-187), so we don't validate them either.
      else if (entry.isFile() && p.endsWith('.md') && entry.name !== 'README.md') {
        results.set(p, validateKnowledgeFile(p))
      }
    }
  }
  walk(dir)
  return results
}
