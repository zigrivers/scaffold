/**
 * Phase 2 Task 11 acceptance test: a deliberately-bad freshness PR must be
 * blocked by at least one gate. We construct one fixture per failure mode
 * and assert each gate detects the matching kind. The test is intentionally
 * narrow per gate — broader coverage lives in each gate's own unit tests.
 */
import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateKnowledgeFile } from '../../../src/validation/knowledge-frontmatter-validator.js'
import { checkUrlsForEntries } from '../../../src/knowledge-freshness/gates/link-check.js'
import type { FetchImpl } from '../../../src/knowledge-freshness/gates/link-check.js'
import {
  lintUnsourcedClaims,
  parseUnifiedDiff,
} from '../../../src/knowledge-freshness/gates/lint-unsourced.js'
import {
  evaluateChurn,
  parseUnifiedDiffForChurn,
} from '../../../src/knowledge-freshness/gates/anti-over-rewrite.js'
import { checkDeepGuidance } from '../../../src/knowledge-freshness/gates/deep-guidance-check.js'
import { parseEntry } from '../../../src/knowledge-freshness/gates/parse-entry.js'

const fixturesDir = path.dirname(fileURLToPath(import.meta.url))
const read = (name: string) => fs.readFileSync(path.join(fixturesDir, name), 'utf8')

const allowResolver = async () => ['93.184.216.34']

describe('deliberately-bad freshness PR fixtures', () => {
  it('Gate 1 (validator): missing description fails', () => {
    const filePath = path.join(fixturesDir, 'validator-missing-description.md')
    const result = validateKnowledgeFile(filePath)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.some((e) => /description/i.test(e.message))).toBe(true)
  })

  it('Gate 2 (link-check): 404 URL fails', async () => {
    const content = read('linkcheck-404.md')
    const parsed = parseEntry(content)
    const fetchImpl = vi.fn(async () => new Response(null, { status: 404 })) as unknown as FetchImpl
    const out = await checkUrlsForEntries(
      [{ file: 'linkcheck-404.md', sourceUrls: parsed.sourceUrls }],
      { resolver: allowResolver, fetchImpl },
    )
    expect(out.ok).toBe(false)
    expect(out.results[0].status).toBe(404)
  })

  it('Gate 3 (lint-unsourced): emits an advisory warning', () => {
    const content = read('lint-unsourced-claim.md')
    // Synthesize a diff where the normative line is the added one.
    const lines = content.split('\n')
    const claimIdx = lines.findIndex((l) => l.includes('must use bcrypt'))
    expect(claimIdx).toBeGreaterThan(0)
    const findings = lintUnsourcedClaims([
      {
        file: 'lint-unsourced-claim.md',
        content,
        addedLines: [{ line: claimIdx + 1, text: lines[claimIdx] }],
      },
    ])
    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].reason).toMatch(/source/i)
  })

  it('Gate 4 (anti-over-rewrite): stable entry past 20% churn fails', () => {
    const content = read('over-rewrite-stable.md')
    const diff = read('over-rewrite-stable.diff')
    const churn = parseUnifiedDiffForChurn(diff)
    // The fixture diff names a `content/knowledge/...` path; we evaluate
    // against the fixture file content directly.
    const total = churn[0]
    const out = evaluateChurn([
      {
        file: 'over-rewrite-stable.md',
        content,
        addedCount: total.addedCount,
        removedCount: total.removedCount,
      },
    ])
    expect(out[0].blocking).toBe(true)
    expect(out[0].volatility).toBe('stable')
  })

  it('Gate 4 (anti-over-rewrite): maintainer override label skips the block', () => {
    const content = read('over-rewrite-stable.md')
    const diff = read('over-rewrite-stable.diff')
    const churn = parseUnifiedDiffForChurn(diff)
    const out = evaluateChurn(
      [{
        file: 'over-rewrite-stable.md',
        content,
        addedCount: churn[0].addedCount,
        removedCount: churn[0].removedCount,
      }],
      { prLabels: ['override:anti-over-rewrite'] },
    )
    expect(out[0].blocking).toBe(false)
    expect(out[0].overridden).toBe(true)
  })

  it('Gate 5 (deep-guidance-check): missing heading fails', () => {
    const content = read('deep-guidance-missing.md')
    const out = checkDeepGuidance([{ file: 'deep-guidance-missing.md', content }])
    expect(out[0].ok).toBe(false)
    expect(out[0].reason).toMatch(/Deep Guidance/)
  })

  it('parseUnifiedDiff handles the over-rewrite fixture diff correctly', () => {
    const diff = read('over-rewrite-stable.diff')
    const parsed = parseUnifiedDiff(diff)
    expect(parsed.length).toBe(1)
    expect(parsed[0].file).toBe('content/knowledge/test/over-rewrite-stable.md')
  })
})
