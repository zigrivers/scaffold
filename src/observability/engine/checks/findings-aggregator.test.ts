import { describe, it, expect } from 'vitest'
import { aggregate } from './findings-aggregator'
import type { Finding, Event } from '../types'

function f(id: string, severity: Finding['severity'], status: Finding['status'] = 'open'): Finding {
  return {
    id, lens_id: 'X', severity,
    title: '', description: '', source_doc: '',
    evidence: { kind: 'orphan_node', graph_query: '', node_id: 'x' },
    confidence: 'high', first_seen: '2026-04-30T00:00:00Z', last_seen: '2026-04-30T00:00:00Z',
    status,
  }
}

function ack(finding_id: string, status: 'acknowledged' | 'open', ts: string, note?: string): Event {
  return {
    event_id: `ulid-${ts}`, worktree_id: 'wid', actor_label: 'a', branch: 'b', task_id: null,
    type: 'finding_acknowledged', ts,
    payload: { finding_id, status, note },
  } as Event
}

describe('aggregate', () => {
  it('keeps engine-set "skipped" status regardless of ledger events', () => {
    const findings = [f('a', 'P3', 'skipped')]
    const events = [ack('a', 'acknowledged', '2026-04-30T01:00:00Z')]
    const out = aggregate(findings, events, 'P2')
    expect(out.findings[0].status).toBe('skipped')
  })

  it('marks an open finding acknowledged from the latest ledger event', () => {
    const findings = [f('a', 'P1')]
    const events = [
      ack('a', 'acknowledged', '2026-04-30T00:00:00Z', 'known issue'),
      ack('a', 'open',         '2026-04-30T00:30:00Z'),
      ack('a', 'acknowledged', '2026-04-30T01:00:00Z', 'final'),
    ]
    const out = aggregate(findings, events, 'P2')
    expect(out.findings[0].status).toBe('acknowledged')
    expect(out.findings[0].ack_note).toBe('final')
  })

  it('computes blocking only for severity at-or-above threshold AND status open', () => {
    const findings = [
      f('p0-open', 'P0'),
      f('p1-ack',  'P1', 'acknowledged'),
      f('p2-open', 'P2'),
      f('p3-open', 'P3'),
    ]
    const out = aggregate(findings, [], 'P2')
    expect(out.summary.blocking).toBe(2)        // p0-open, p2-open (acknowledged + p3 are excluded)
    expect(out.summary.acknowledged).toBe(0)    // p1-ack starts acknowledged via finding.status; ack count uses ledger-driven mutations
    expect(out.summary.by_severity).toEqual({ P0: 1, P1: 1, P2: 1, P3: 1 })
    expect(out.summary.by_severity_status.P0).toEqual({ open: 1, acknowledged: 0, skipped: 0 })
    expect(out.summary.by_severity_status.P1).toEqual({ open: 0, acknowledged: 1, skipped: 0 })
  })

  it('counts skipped lenses (distinct lens_ids that emitted skipped status)', () => {
    const a = f('a', 'P3', 'skipped'); a.lens_id = 'A'
    const b = f('b', 'P3', 'skipped'); b.lens_id = 'B'
    const c = f('c', 'P3', 'skipped'); c.lens_id = 'A'  // duplicate lens
    const out = aggregate([a, b, c], [], 'P2')
    expect(out.summary.skipped_lenses).toBe(2)
  })
})
