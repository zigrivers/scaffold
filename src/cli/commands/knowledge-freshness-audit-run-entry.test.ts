import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SourceUnusableError } from '../../knowledge-freshness/redirect-classifier.js'

// runEntryAudit is what the handler awaits; stub it per-test.
vi.mock('../../knowledge-freshness/audit-runner.js', () => ({
  runEntryAudit: vi.fn(),
}))
vi.mock('../../knowledge-freshness/providers/index.js', () => ({
  resolveProvider: () => 'anthropic',
  buildDispatcher: () => async () => '',
}))
import { runEntryAudit } from '../../knowledge-freshness/audit-runner.js'
import cmd from './knowledge-freshness-audit-run-entry.js'

describe('audit-run-entry handler', () => {
  let out = ''
  beforeEach(() => { out = ''; vi.spyOn(process.stdout, 'write').mockImplementation((s) => { out += s; return true }) })
  afterEach(() => { vi.restoreAllMocks() })

  it('emits a skip envelope and does not throw on SourceUnusableError', async () => {
    vi.mocked(runEntryAudit).mockRejectedValue(new SourceUnusableError('https://owasp.org/Top10/', 'stub'))
    await (cmd.handler as any)({ entryPath: 'e.md', timeout: 600 })
    const parsed = JSON.parse(out)
    expect(parsed).toMatchObject({ skipped: true, reason: 'source-unusable', url: 'https://owasp.org/Top10/' })
  })

  it('rethrows other errors (non-zero exit)', async () => {
    vi.mocked(runEntryAudit).mockRejectedValue(new Error('network timeout'))
    await expect((cmd.handler as any)({ entryPath: 'e.md', timeout: 600 })).rejects.toThrow(/timeout/)
  })
})
