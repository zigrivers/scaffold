import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'

// Stub heavy dependencies before importing the command module.
vi.mock('../../knowledge-freshness/audit-apply.js', () => ({
  applyVerdictToEntry: vi.fn(),
  normalizeUrl: vi.fn((u: string) => u),
}))
vi.mock('../../knowledge-freshness/source-hash.js', () => ({
  fetchAndHash: vi.fn(),
}))
vi.mock('../../knowledge-freshness/audit-apply-pr.js', () => ({
  openFreshnessPr: vi.fn(),
  readVolatility: vi.fn(() => 'high'),
}))

import { fetchAndHash } from '../../knowledge-freshness/source-hash.js'
import cmd from './knowledge-freshness-audit-apply.js'

// Helper to build a minimal argv shape the handler accepts.
function makeArgv(overrides: Record<string, unknown> = {}) {
  return {
    entryPath: '/fake/entry.md',
    verdictPath: '/fake/verdict.json',
    'open-pr': false,
    openPr: false,
    ...overrides,
  }
}

describe('audit-apply handler', () => {
  let stderrOut = ''

  beforeEach(() => {
    stderrOut = ''
    vi.spyOn(process.stderr, 'write').mockImplementation((s) => { stderrOut += s; return true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // F4: source_unverifiable short-circuit
  describe('source_unverifiable short-circuit', () => {
    it('exits 0 with no-op message and skips fetch/apply when verdict has source_unverifiable=true', async () => {
      const verdict = {
        entry_name: 'test-entry',
        verdict: 'current' as const,
        sources_checked: [{ url: 'https://x.test/', retrieved_at: '2026-01-01', content_hash: 'abc' }],
        source_unverifiable: true,
      }

      // Stub fs.readFileSync to return the verdict JSON for the verdict path.
      // We use a spy that targets the actual module's fs usage.
      vi.spyOn(fs, 'readFileSync').mockImplementation((path) => {
        if (String(path) === '/fake/verdict.json') {
          return JSON.stringify(verdict)
        }
        // entry file — should NOT be read when source_unverifiable=true
        throw new Error(`Unexpected fs.readFileSync call for: ${path}`)
      })

      const argv = makeArgv()
      await cmd.handler!(argv as unknown as Parameters<NonNullable<typeof cmd.handler>>[0])

      // fetchAndHash must NOT be called (no re-fetch on unverifiable source).
      expect(fetchAndHash).not.toHaveBeenCalled()

      // entry file must NOT be written.
      const writeFileSpy = vi.spyOn(fs, 'writeFileSync')
      expect(writeFileSpy).not.toHaveBeenCalled()

      // stderr must mention the skip.
      expect(stderrOut).toMatch(/no-op.*source_unverifiable/i)
      expect(stderrOut).toMatch(/test-entry/)
    })

    it('does not open a PR when source_unverifiable=true even with --open-pr', async () => {
      const { openFreshnessPr } = await import('../../knowledge-freshness/audit-apply-pr.js')

      const verdict = {
        entry_name: 'another-entry',
        verdict: 'major-drift' as const,
        sources_checked: [],
        source_unverifiable: true,
      }

      vi.spyOn(fs, 'readFileSync').mockImplementation((path) => {
        if (String(path) === '/fake/verdict.json') return JSON.stringify(verdict)
        throw new Error(`Unexpected call: ${path}`)
      })

      const argv = makeArgv({ 'open-pr': true, openPr: true })
      await cmd.handler!(argv as unknown as Parameters<NonNullable<typeof cmd.handler>>[0])

      expect(openFreshnessPr).not.toHaveBeenCalled()
      expect(stderrOut).toMatch(/no-op.*source_unverifiable/i)
    })
  })
})
