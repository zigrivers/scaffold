import { describe, it, expect } from 'vitest'
import { formatMarkdown } from '../../src/formatters/markdown.js'
import type { ReconciledResults } from '../../src/types.js'

describe('formatMarkdown', () => {
  it('produces markdown with findings table when blocked', () => {
    const results: ReconciledResults = {
      job_id: 'mmr-abc123',
      verdict: 'blocked',
      fix_threshold: 'P2',
      reconciled_findings: [{
        severity: 'P0', confidence: 'high', location: 'file.ts:10',
        description: 'Security vuln', suggestion: 'Sanitize input',
        sources: ['claude', 'gemini'], agreement: 'consensus',
      }],
      per_channel: {
        claude: { status: 'completed', elapsed: '30s', findings: [] },
        gemini: { status: 'completed', elapsed: '45s', findings: [] },
      },
      metadata: { channels_dispatched: 2, channels_completed: 2, channels_partial: 0, total_elapsed: '45s' },
    }
    const md = formatMarkdown(results)
    expect(md).toContain('## Multi-Model Review — BLOCKED')
    expect(md).toContain('P0')
    expect(md).toContain('Security vuln')
    expect(md).toContain('|')
  })

  it('displays PASSED for pass verdict', () => {
    const results: ReconciledResults = {
      job_id: 'mmr-test',
      verdict: 'pass',
      fix_threshold: 'P2',
      reconciled_findings: [],
      per_channel: { claude: { status: 'completed', elapsed: '30s', findings: [] } },
      metadata: { channels_dispatched: 1, channels_completed: 1, channels_partial: 0, total_elapsed: '30s' },
    }
    const md = formatMarkdown(results)
    expect(md).toContain('## Multi-Model Review — PASSED')
  })

  it('displays PASSED for degraded-pass verdict', () => {
    const results: ReconciledResults = {
      job_id: 'mmr-test',
      verdict: 'degraded-pass',
      fix_threshold: 'P2',
      reconciled_findings: [],
      per_channel: {},
      metadata: { channels_dispatched: 2, channels_completed: 1, channels_partial: 1, total_elapsed: '5s' },
    }
    const md = formatMarkdown(results)
    expect(md).toContain('## Multi-Model Review — PASSED')
  })

  it('displays NEEDS DECISION for needs-user-decision verdict', () => {
    const results: ReconciledResults = {
      job_id: 'mmr-test',
      verdict: 'needs-user-decision',
      fix_threshold: 'P2',
      reconciled_findings: [],
      per_channel: {},
      metadata: { channels_dispatched: 2, channels_completed: 0, channels_partial: 2, total_elapsed: '5s' },
    }
    const md = formatMarkdown(results)
    expect(md).toContain('## Multi-Model Review — NEEDS DECISION')
  })
})
