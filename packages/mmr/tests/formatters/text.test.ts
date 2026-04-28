import { describe, it, expect } from 'vitest'
import { formatText } from '../../src/formatters/text.js'
import type { ReconciledResults } from '../../src/types.js'

describe('formatText', () => {
  it('shows PASSED when gate passes', () => {
    const results: ReconciledResults = {
      job_id: 'mmr-abc123',
      verdict: 'pass',
      fix_threshold: 'P2',
      advisory_count: 0,
      approved: true,
      summary: 'Review passed',
      reconciled_findings: [],
      per_channel: { claude: { status: 'completed', elapsed: '30s', findings: [] } },
      metadata: { channels_dispatched: 1, channels_completed: 1, channels_partial: 0, total_elapsed: '30s' },
    }
    const output = formatText(results)
    expect(output).toContain('PASSED')
    expect(output).toContain('mmr-abc123')
  })

  it('shows BLOCKED with findings when gate fails', () => {
    const results: ReconciledResults = {
      job_id: 'mmr-abc123',
      verdict: 'blocked',
      fix_threshold: 'P2',
      advisory_count: 0,
      approved: false,
      summary: 'Review blocked — 1 finding(s) at or above P2',
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
    expect(output).toContain('BLOCKED')
    expect(output).toContain('P1')
    expect(output).toContain('file.ts:10')
    expect(output).toContain('Bug found')
  })

  it('displays PASSED for degraded-pass verdict', () => {
    const results: ReconciledResults = {
      job_id: 'mmr-test',
      verdict: 'degraded-pass',
      fix_threshold: 'P2',
      advisory_count: 0,
      approved: true,
      summary: 'Review passed (degraded — some channels unavailable)',
      reconciled_findings: [],
      per_channel: {},
      metadata: { channels_dispatched: 2, channels_completed: 1, channels_partial: 1, total_elapsed: '5s' },
    }
    const output = formatText(results)
    expect(output).toContain('PASSED')
  })

  it('displays NEEDS DECISION for needs-user-decision verdict', () => {
    const results: ReconciledResults = {
      job_id: 'mmr-test',
      verdict: 'needs-user-decision',
      fix_threshold: 'P2',
      advisory_count: 0,
      approved: false,
      summary: 'No channels completed — manual review needed',
      reconciled_findings: [],
      per_channel: {},
      metadata: { channels_dispatched: 2, channels_completed: 0, channels_partial: 2, total_elapsed: '5s' },
    }
    const output = formatText(results)
    expect(output).toContain('NEEDS DECISION')
  })

  it('shows advisory count when present', () => {
    const results: ReconciledResults = {
      job_id: 'mmr-adv',
      verdict: 'pass',
      fix_threshold: 'P2',
      advisory_count: 3,
      approved: true,
      summary: 'Review passed',
      reconciled_findings: [],
      per_channel: { claude: { status: 'completed', elapsed: '5s', findings: [] } },
      metadata: { channels_dispatched: 1, channels_completed: 1, channels_partial: 0, total_elapsed: '5s' },
    }
    const output = formatText(results)
    expect(output).toContain('Advisory: 3')
  })

  it('omits advisory segment when count is zero', () => {
    const results: ReconciledResults = {
      job_id: 'mmr-noadv',
      verdict: 'pass',
      fix_threshold: 'P2',
      advisory_count: 0,
      approved: true,
      summary: 'Review passed',
      reconciled_findings: [],
      per_channel: { claude: { status: 'completed', elapsed: '5s', findings: [] } },
      metadata: { channels_dispatched: 1, channels_completed: 1, channels_partial: 0, total_elapsed: '5s' },
    }
    const output = formatText(results)
    expect(output).not.toContain('Advisory')
  })
})
