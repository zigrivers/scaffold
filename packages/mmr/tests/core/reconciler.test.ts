import { describe, it, expect } from 'vitest'
import { reconcile, evaluateGate, deriveVerdict } from '../../src/core/reconciler.js'
import { computeFindingKey } from '../../src/core/stable-id.js'
import type { Finding, ReconciledFinding, ChannelStatus } from '../../src/types.js'

describe('reconcile', () => {
  it('marks findings as consensus when 2+ channels agree on location and severity', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [{ severity: 'P1', location: 'file.ts:10', description: 'bug A', suggestion: 'fix A' }],
      gemini: [{ severity: 'P1', location: 'file.ts:10', description: 'bug A', suggestion: 'fix A' }],
    }
    const result = reconcile(channelFindings)
    expect(result).toHaveLength(1)
    expect(result[0].agreement).toBe('consensus')
    expect(result[0].confidence).toBe('high')
    expect(result[0].sources).toContain('claude')
    expect(result[0].sources).toContain('gemini')
  })

  it('reports at higher severity when channels disagree on severity for same location', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [{ severity: 'P2', location: 'file.ts:10', description: 'minor', suggestion: 'fix' }],
      gemini: [{ severity: 'P1', location: 'file.ts:10', description: 'minor', suggestion: 'fix' }],
    }
    const result = reconcile(channelFindings)
    expect(result).toHaveLength(1)
    expect(result[0].severity).toBe('P1')
    expect(result[0].confidence).toBe('medium')
  })

  it('marks single-source findings as unique', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [{ severity: 'P2', location: 'file.ts:20', description: 'only claude', suggestion: 'fix' }],
      gemini: [],
    }
    const result = reconcile(channelFindings)
    expect(result).toHaveLength(1)
    expect(result[0].agreement).toBe('unique')
    expect(result[0].sources).toEqual(['claude'])
  })

  it('always reports P0 findings as high confidence even from single source', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [{ severity: 'P0', location: 'file.ts:1', description: 'critical', suggestion: 'fix now' }],
      gemini: [],
    }
    const result = reconcile(channelFindings)
    expect(result).toHaveLength(1)
    expect(result[0].confidence).toBe('high')
  })

  it('returns empty array when all channels approve with no findings', () => {
    const channelFindings: Record<string, Finding[]> = { claude: [], gemini: [] }
    const result = reconcile(channelFindings)
    expect(result).toHaveLength(0)
  })

  it('auto-generates IDs for findings without them', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [{ severity: 'P1', location: 'a.ts:1', description: 'bug', suggestion: 'fix' }],
    }
    const result = reconcile(channelFindings)
    expect(result[0].id).toBe('F-001')
  })

  it('preserves caller-supplied IDs', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [{ id: 'MY-1', severity: 'P1', location: 'a.ts:1', description: 'bug', suggestion: 'fix' }],
    }
    const result = reconcile(channelFindings)
    expect(result[0].id).toBe('MY-1')
  })

  it('carries category through reconciliation', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [{ category: 'security', severity: 'P0', location: 'a.ts:1', description: 'vuln', suggestion: 'fix' }],
    }
    const result = reconcile(channelFindings)
    expect(result[0].category).toBe('security')
  })

  it('assigns low confidence to findings from compensating channels', () => {
    const channelFindings: Record<string, Finding[]> = {
      'compensating-codex': [{ severity: 'P2', location: 'f.ts:10', description: 'issue', suggestion: 'fix' }],
    }
    const result = reconcile(channelFindings)
    expect(result[0].confidence).toBe('low')
    expect(result[0].sources).toEqual(['compensating-codex'])
  })

  it('uses the finding with the longest description as representative', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [{ severity: 'P1', location: 'file.ts:10', description: 'Regression risk', suggestion: 'Add test' }],
      gemini: [{ severity: 'P1', location: 'file.ts:10', description: '  REGRESSION   RISK  ', suggestion: 'Add test' }],
    }
    const result = reconcile(channelFindings)
    expect(result).toHaveLength(1)
    expect(result[0].description).toBe('  REGRESSION   RISK  ')
  })

  it('does not collapse repeated same-source findings at different raw locations', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [
        { severity: 'P2', location: 'file.ts:10', description: 'Regression risk', suggestion: 'Add test' },
        { severity: 'P2', location: 'file.ts:99', description: 'Regression risk', suggestion: 'Add test' },
      ],
    }
    const result = reconcile(channelFindings)
    expect(result).toHaveLength(2)
  })

  it('joins duplicate stable keys to the group with the matching raw location', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [
        { severity: 'P2', location: 'file.ts:10', description: 'Regression risk', suggestion: 'Add test' },
        { severity: 'P2', location: 'file.ts:99', description: 'Regression risk', suggestion: 'Add test' },
      ],
      gemini: [
        { severity: 'P1', location: 'file.ts:99', description: 'Regression risk', suggestion: 'Add test' },
      ],
    }
    const result = reconcile(channelFindings)
    expect(result).toHaveLength(2)

    const line10 = result.find((finding) => finding.location === 'file.ts:10')
    const line99 = result.find((finding) => finding.location === 'file.ts:99')
    expect(line10?.sources).toEqual(['claude'])
    expect(line10?.severity).toBe('P2')
    expect(line99?.sources).toEqual(['claude', 'gemini'])
    expect(line99?.severity).toBe('P1')
  })

  it('fuzzy-merges matching descriptions even when suggestions differ', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [{ severity: 'P2', location: 'file.ts:10', description: 'Regression risk', suggestion: 'Add test' }],
      gemini: [{
        severity: 'P2',
        location: 'file.ts:10',
        description: '  REGRESSION   RISK  ',
        suggestion: 'Add backward compatibility',
      }],
    }
    const result = reconcile(channelFindings)
    expect(result).toHaveLength(1)
    expect(result[0].sources.sort()).toEqual(['claude', 'gemini'])
  })

  it('fuzzy-merges similar descriptions even when suggestions differ', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [{ severity: 'P2', location: 'file.ts:10', description: 'Regression risk in checkout flow should be covered', suggestion: 'Add test' }],
      gemini: [{
        severity: 'P2',
        location: 'file.ts:10',
        description: 'Regression risk in checkout flow must be covered',
        suggestion: 'Add backward compatibility coverage',
      }],
    }
    const result = reconcile(channelFindings)
    expect(result).toHaveLength(1)
    expect(result[0].sources.sort()).toEqual(['claude', 'gemini'])
  })

  it('fuzzy-merges when only one channel provides category', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [{
        category: 'tests',
        severity: 'P2',
        location: 'file.ts:10',
        description: 'Regression risk in checkout flow should be covered',
        suggestion: 'Add test',
      }],
      gemini: [{
        severity: 'P2',
        location: 'file.ts:10',
        description: 'Regression risk in checkout flow must be covered',
        suggestion: 'Add test',
      }],
    }
    const result = reconcile(channelFindings)
    expect(result).toHaveLength(1)
    expect(result[0].sources.sort()).toEqual(['claude', 'gemini'])
  })

  it('does not fuzzy-merge different raw lines with different suggestions', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [{
        category: 'tests',
        severity: 'P2',
        location: 'file.ts:10',
        description: 'Regression risk in checkout flow should be covered',
        suggestion: 'Add test',
      }],
      gemini: [{
        category: 'compatibility',
        severity: 'P2',
        location: 'file.ts:99',
        description: 'Regression risk in checkout flow must be covered',
        suggestion: 'Add backward compatibility coverage',
      }],
    }
    const result = reconcile(channelFindings)
    expect(result).toHaveLength(2)
  })

  it('does not fuzzy-merge findings with empty shingles', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [{ severity: 'P2', location: 'file.ts:10', description: 'abc', suggestion: 'Add test' }],
      gemini: [{ severity: 'P2', location: 'file.ts:10', description: 'def', suggestion: 'Add test' }],
    }
    const result = reconcile(channelFindings)
    expect(result).toHaveLength(2)
  })

  it('reconciles findings whose only difference is line number', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [{ severity: 'P1', location: 'file.ts:10', description: 'bug A', suggestion: 'fix A' }],
      gemini: [{ severity: 'P1', location: 'file.ts:99', description: 'bug A', suggestion: 'fix A' }],
    }
    const result = reconcile(channelFindings)
    expect(result).toHaveLength(1)
    expect(result[0].agreement).toBe('consensus')
  })

  it('reconciles findings whose only difference is severity', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [{ severity: 'P2', location: 'file.ts:10', description: 'bug A', suggestion: 'fix A' }],
      gemini: [{ severity: 'P1', location: 'file.ts:10', description: 'bug A', suggestion: 'fix A' }],
    }
    const result = reconcile(channelFindings)
    expect(result).toHaveLength(1)
    expect(result[0].severity).toBe('P1')
  })

  it('assigns high confidence to P0 even from compensating channels', () => {
    const channelFindings: Record<string, Finding[]> = {
      'compensating-codex': [{ severity: 'P0', location: 'f.ts:1', description: 'critical', suggestion: 'fix' }],
    }
    const result = reconcile(channelFindings)
    expect(result[0].confidence).toBe('high')
  })
})

describe('reconcile - T2-A stable-identity grouping', () => {
  it('groups two channels reporting the same key into one reconciled finding', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [{ severity: 'P1', location: 'src/foo.ts:10', description: 'Variable `x` unused', suggestion: 'remove `x`' }],
      gemini: [{ severity: 'P1', location: 'src/foo.ts:42', description: 'Variable `x` unused', suggestion: 'remove `x`' }],
    }
    const result = reconcile(channelFindings)
    expect(result).toHaveLength(1)
    expect(result[0].sources.sort()).toEqual(['claude', 'gemini'])
    expect(result[0].finding_key).toMatch(/^[a-f0-9]{40}$/)
  })

  it('keeps same-file findings with different code identifiers separate', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [
        { severity: 'P2', location: 'src/foo.ts:10', description: 'Variable `fooBar` is unused', suggestion: 'remove `fooBar`' },
        { severity: 'P2', location: 'src/foo.ts:20', description: 'Variable `bazQux` is unused', suggestion: 'remove `bazQux`' },
      ],
    }
    const result = reconcile(channelFindings)
    expect(result).toHaveLength(2)
    expect(result[0].finding_key).not.toBe(result[1].finding_key)
  })

  it('uses Jaccard fallback to merge same-issue findings phrased differently', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [{ severity: 'P1', location: 'src/foo.ts:10', description: 'unused variable named fooBar should be removed', suggestion: 'remove it' }],
      gemini: [{ severity: 'P1', location: 'src/foo.ts:10', description: 'unused variable named fooBar must be removed', suggestion: 'remove it' }],
    }
    const result = reconcile(channelFindings)
    expect(result).toHaveLength(1)
    expect(result[0].sources.sort()).toEqual(['claude', 'gemini'])
  })

  it('does not merge findings in different files even if descriptions are similar', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [{ severity: 'P2', location: 'src/foo.ts:10', description: 'unused variable named x', suggestion: 'remove' }],
      gemini: [{ severity: 'P2', location: 'src/bar.ts:10', description: 'unused variable named x', suggestion: 'remove' }],
    }
    const result = reconcile(channelFindings)
    expect(result).toHaveLength(2)
  })

  it('persists description_shingle and finding_key on every reconciled finding', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [{ severity: 'P0', location: 'src/foo.ts:1', description: 'critical bug here', suggestion: 'fix' }],
    }
    const result = reconcile(channelFindings)
    expect(result[0].finding_key).toMatch(/^[a-f0-9]{40}$/)
    expect(Array.isArray(result[0].description_shingle)).toBe(true)
    expect(result[0].description_shingle!.length).toBeGreaterThan(0)
  })

  it('uses a finding_key consistent with the reported representative finding', () => {
    const channelFindings: Record<string, Finding[]> = {
      gemini: [{ severity: 'P1', location: 'src/foo.ts:10', description: 'unused variable named fooBar must be removed', suggestion: 'remove it' }],
      claude: [{ severity: 'P1', location: 'src/foo.ts:10', description: 'unused variable named fooBar should be removed now', suggestion: 'remove it' }],
    }
    const result = reconcile(channelFindings)
    expect(result).toHaveLength(1)
    expect(result[0].finding_key).toBe(computeFindingKey(result[0]))
  })

  it('produces stable fuzzy grouping keys regardless of channel iteration order', () => {
    const first = reconcile({
      claude: [{ severity: 'P1', location: 'src/foo.ts:10', description: 'unused variable named fooBar should be removed', suggestion: 'remove it' }],
      gemini: [{ severity: 'P1', location: 'src/foo.ts:10', description: 'unused variable named fooBar must be removed', suggestion: 'remove it' }],
    })
    const second = reconcile({
      gemini: [{ severity: 'P1', location: 'src/foo.ts:10', description: 'unused variable named fooBar must be removed', suggestion: 'remove it' }],
      claude: [{ severity: 'P1', location: 'src/foo.ts:10', description: 'unused variable named fooBar should be removed', suggestion: 'remove it' }],
    })
    expect(second[0].finding_key).toBe(first[0].finding_key)
  })

  it('preserves F-\\d{3} id backfill for consumers that read id', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [{ severity: 'P1', location: 'a.ts:1', description: 'bug', suggestion: 'fix' }],
    }
    const result = reconcile(channelFindings)
    expect(result[0].id).toBe('F-001')
  })
})

describe('evaluateGate', () => {
  it('passes when no findings exist', () => {
    expect(evaluateGate([], 'P2')).toBe(true)
  })

  it('passes when all findings are below threshold', () => {
    const findings: ReconciledFinding[] = [{
      severity: 'P3', location: 'f.ts:1', description: 'nit', suggestion: 'fix',
      confidence: 'low', sources: ['claude'], agreement: 'unique',
    }]
    expect(evaluateGate(findings, 'P2')).toBe(true)
  })

  it('fails when a finding meets the threshold', () => {
    const findings: ReconciledFinding[] = [{
      severity: 'P2', location: 'f.ts:1', description: 'improvement', suggestion: 'fix',
      confidence: 'medium', sources: ['claude'], agreement: 'unique',
    }]
    expect(evaluateGate(findings, 'P2')).toBe(false)
  })

  it('fails when a finding exceeds the threshold', () => {
    const findings: ReconciledFinding[] = [{
      severity: 'P0', location: 'f.ts:1', description: 'critical', suggestion: 'fix',
      confidence: 'high', sources: ['claude', 'gemini'], agreement: 'consensus',
    }]
    expect(evaluateGate(findings, 'P2')).toBe(false)
  })

  it('passes when a threshold finding is acknowledged', () => {
    const findings: ReconciledFinding[] = [{
      severity: 'P2', location: 'f.ts:1', description: 'improvement', suggestion: 'fix',
      confidence: 'medium', sources: ['claude'], agreement: 'unique', acknowledged: true,
    }]
    expect(evaluateGate(findings, 'P2')).toBe(true)
  })

  it('fails when acknowledged and unacknowledged blocking findings are mixed', () => {
    const findings: ReconciledFinding[] = [
      {
        severity: 'P1', location: 'a.ts:1', description: 'acked', suggestion: 'fix',
        confidence: 'medium', sources: ['claude'], agreement: 'unique', acknowledged: true,
      },
      {
        severity: 'P2', location: 'b.ts:2', description: 'open', suggestion: 'fix',
        confidence: 'medium', sources: ['gemini'], agreement: 'unique',
      },
    ]
    expect(evaluateGate(findings, 'P2')).toBe(false)
  })
})

describe('deriveVerdict', () => {
  it('returns pass when gate passes and all channels completed', () => {
    const statuses: Record<string, ChannelStatus> = { claude: 'completed', gemini: 'completed' }
    expect(deriveVerdict(true, statuses)).toBe('pass')
  })

  it('returns blocked when gate fails regardless of channel status', () => {
    const statuses: Record<string, ChannelStatus> = { claude: 'completed', gemini: 'completed' }
    expect(deriveVerdict(false, statuses)).toBe('blocked')
  })

  it('returns degraded-pass when gate passes but some channels failed', () => {
    const statuses: Record<string, ChannelStatus> = { claude: 'completed', gemini: 'failed' }
    expect(deriveVerdict(true, statuses)).toBe('degraded-pass')
  })

  it('returns degraded-pass when gate passes but some channels timed out', () => {
    const statuses: Record<string, ChannelStatus> = { claude: 'completed', codex: 'timeout' }
    expect(deriveVerdict(true, statuses)).toBe('degraded-pass')
  })

  it('returns degraded-pass when some channels are not_installed', () => {
    const statuses: Record<string, ChannelStatus> = { claude: 'completed', codex: 'not_installed' }
    expect(deriveVerdict(true, statuses)).toBe('degraded-pass')
  })

  it('returns needs-user-decision when no channels completed', () => {
    const statuses: Record<string, ChannelStatus> = { claude: 'failed', gemini: 'timeout' }
    expect(deriveVerdict(true, statuses)).toBe('needs-user-decision')
  })

  it('returns needs-user-decision when all channels auth_failed', () => {
    const statuses: Record<string, ChannelStatus> = { claude: 'auth_failed', gemini: 'auth_failed' }
    expect(deriveVerdict(true, statuses)).toBe('needs-user-decision')
  })

  it('returns degraded-pass when some channels are skipped', () => {
    const statuses: Record<string, ChannelStatus> = { claude: 'completed', codex: 'skipped' }
    expect(deriveVerdict(true, statuses)).toBe('degraded-pass')
  })
})
