import { describe, it, expect } from 'vitest'
import { reconcile, evaluateGate } from '../../src/core/reconciler.js'
import type { Finding, ReconciledFinding } from '../../src/types.js'

describe('reconcile', () => {
  it('marks findings as consensus when 2+ channels agree on location and severity', () => {
    const channelFindings: Record<string, Finding[]> = {
      claude: [{ severity: 'P1', location: 'file.ts:10', description: 'bug A', suggestion: 'fix A' }],
      gemini: [{ severity: 'P1', location: 'file.ts:10', description: 'bug A variant', suggestion: 'fix A alt' }],
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
      gemini: [{ severity: 'P1', location: 'file.ts:10', description: 'important', suggestion: 'fix' }],
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
})
