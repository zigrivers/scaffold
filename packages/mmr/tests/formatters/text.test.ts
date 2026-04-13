import { describe, it, expect } from 'vitest'
import { formatText } from '../../src/formatters/text.js'
import type { ReconciledResults } from '../../src/types.js'

describe('formatText', () => {
  it('shows PASSED when gate passes', () => {
    const results: ReconciledResults = {
      job_id: 'mmr-abc123',
      verdict: 'pass',
      fix_threshold: 'P2',
      reconciled_findings: [],
      per_channel: { claude: { status: 'completed', elapsed: '30s', findings: [] } },
      metadata: { channels_dispatched: 1, channels_completed: 1, channels_partial: 0, total_elapsed: '30s' },
    }
    const output = formatText(results)
    expect(output).toContain('PASSED')
    expect(output).toContain('mmr-abc123')
  })

  it('shows FAILED with findings when gate fails', () => {
    const results: ReconciledResults = {
      job_id: 'mmr-abc123',
      verdict: 'blocked',
      fix_threshold: 'P2',
      reconciled_findings: [{
        severity: 'P1', confidence: 'high', location: 'file.ts:10',
        description: 'Bug found', suggestion: 'Fix it',
        sources: ['claude', 'gemini'], agreement: 'consensus',
      }],
      per_channel: {
        claude: { status: 'completed', elapsed: '30s', findings: [] },
        gemini: { status: 'completed', elapsed: '45s', findings: [] },
      },
      metadata: { channels_dispatched: 2, channels_completed: 2, channels_partial: 0, total_elapsed: '45s' },
    }
    const output = formatText(results)
    expect(output).toContain('FAILED')
    expect(output).toContain('P1')
    expect(output).toContain('file.ts:10')
    expect(output).toContain('Bug found')
  })
})
