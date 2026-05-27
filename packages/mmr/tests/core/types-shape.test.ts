import { describe, it, expect } from 'vitest'
import type { ReconciledFinding } from '../../src/types.js'

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
