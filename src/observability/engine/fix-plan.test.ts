import { describe, it, expect } from 'vitest'
import { buildFixPlan } from './fix-plan'
import type { Finding } from './types'

function f(id: string, severity: Finding['severity'], lens_id: string, status: Finding['status'] = 'open'): Finding {
  return {
    id, lens_id, severity,
    title: '', description: '', source_doc: '',
    evidence: { kind: 'orphan_node', graph_query: '', node_id: 'x' },
    confidence: 'high', first_seen: '', last_seen: '', status,
  }
}

describe('buildFixPlan', () => {
  it('includes blocking open findings (severityRank <= threshold)', () => {
    const findings = [
      f('a', 'P0', 'A-tdd'),
      f('b', 'P1', 'B-ac-coverage'),
      f('c', 'P2', 'C-standards'),
      f('d', 'P3', 'D-stack'),
    ]
    const plan = buildFixPlan(findings, 'P2')
    expect(plan.map((f) => f.id)).toEqual(['a', 'b', 'c'])
  })

  it('orders by severity (P0 first), tiebreak by lens_id', () => {
    const findings = [
      f('z-p1', 'P1', 'Z-zzz'),
      f('a-p1', 'P1', 'A-tdd'),
      f('a-p0', 'P0', 'A-tdd'),
    ]
    const plan = buildFixPlan(findings, 'P2')
    expect(plan.map((f) => f.id)).toEqual(['a-p0', 'a-p1', 'z-p1'])
  })

  it('excludes acknowledged + skipped findings', () => {
    const findings = [
      f('a', 'P0', 'A-tdd', 'acknowledged'),
      f('b', 'P1', 'B-ac-coverage', 'skipped'),
      f('c', 'P2', 'C-standards', 'open'),
    ]
    const plan = buildFixPlan(findings, 'P2')
    expect(plan.map((f) => f.id)).toEqual(['c'])
  })

  it('returns [] when no blocking findings exist', () => {
    expect(buildFixPlan([f('x', 'P3', 'X')], 'P2')).toEqual([])
  })
})
