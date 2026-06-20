import { describe, expect, it } from 'vitest'
import { formatText } from '../../src/formatters/text.js'
import type { ReconciledResults } from '../../src/types.js'

function base(): ReconciledResults {
  return {
    job_id: 'job_x',
    verdict: 'pass',
    fix_threshold: 'P2',
    advisory_count: 0,
    approved: true,
    summary: '',
    reconciled_findings: [],
    per_channel: {
      claude: { status: 'completed', elapsed: '3s', findings: [] },
      grok: { status: 'not_installed', elapsed: '0s', findings: [] },
    },
    metadata: { channels_dispatched: 2, channels_completed: 1, channels_partial: 0, total_elapsed: '3s' },
  }
}

describe('formatText remediation', () => {
  it('prints a remediation line for a not-installed channel and a doctor pointer', () => {
    const out = formatText(base())
    expect(out).toMatch(/grok: not_installed/)
    expect(out).toContain('mmr config disable grok')
    expect(out).toContain('mmr config test')
  })

  it('prints the recovery command for an auth_failed channel', () => {
    const r = base()
    r.per_channel.grok = { status: 'auth_failed', elapsed: '1s', findings: [], recovery: 'grok login' }
    const out = formatText(r)
    expect(out).toContain('grok login')
    expect(out).toContain('mmr config test')
  })

  it('prints no remediation block when all channels completed', () => {
    const r = base()
    r.per_channel.grok = { status: 'completed', elapsed: '2s', findings: [] }
    const out = formatText(r)
    expect(out).not.toContain('mmr config test')
  })
})
