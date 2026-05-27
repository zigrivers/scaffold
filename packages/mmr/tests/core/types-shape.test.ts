import { describe, it, expect } from 'vitest'
import type { JobMetadata, ReconciledFinding } from '../../src/types.js'

describe('ReconciledFinding shape', () => {
  it('accepts a finding with all new T2-A/B/C/D fields populated', () => {
    const f: ReconciledFinding = {
      severity: 'P1',
      location: 'src/foo.ts:42',
      description: 'bug',
      suggestion: 'fix',
      confidence: 'high',
      sources: ['claude'],
      agreement: 'unique',
      finding_key: 'a'.repeat(40),
      description_shingle: ['hello', 'world'],
      acknowledged: true,
      ack_reason: 'intentional',
      ack_match: 'exact',
      auto_downgraded: false,
      auto_suppressed: false,
      repeat_match: 'fuzzy',
    }
    // Round-trip to JSON to confirm the type permits these fields end-to-end.
    const restored = JSON.parse(JSON.stringify(f)) as ReconciledFinding
    expect(restored.finding_key).toBe('a'.repeat(40))
    expect(restored.acknowledged).toBe(true)
    expect(restored.ack_match).toBe('exact')
    expect(restored.repeat_match).toBe('fuzzy')
  })

  it('keeps existing required fields unchanged', () => {
    const f: ReconciledFinding = {
      severity: 'P2',
      location: 'a.ts',
      description: 'd',
      suggestion: 's',
      confidence: 'medium',
      sources: ['gemini'],
      agreement: 'unique',
    }
    expect(f.severity).toBe('P2')
  })
})

describe('JobMetadata shape', () => {
  it('accepts session_id and round when present', () => {
    const j: JobMetadata = {
      job_id: 'mmr-abcdef',
      status: 'completed',
      fix_threshold: 'P2',
      format: 'json',
      created_at: '2026-05-22T00:00:00Z',
      channels: {},
      session_id: 'feat-foo',
      round: 3,
    }
    const restored = JSON.parse(JSON.stringify(j)) as JobMetadata
    expect(restored.session_id).toBe('feat-foo')
    expect(restored.round).toBe(3)
  })

  it('still accepts a job with no session linkage', () => {
    const j: JobMetadata = {
      job_id: 'mmr-abcdef',
      status: 'completed',
      fix_threshold: 'P2',
      format: 'json',
      created_at: '2026-05-22T00:00:00Z',
      channels: {},
    }
    expect(j.session_id).toBeUndefined()
  })
})
