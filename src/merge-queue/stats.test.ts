import { describe, expect, it } from 'vitest'
import { computeStats } from './stats.js'
import type { JournalEvent } from './types.js'

const NOW = new Date('2026-07-17T12:00:00.000Z')

describe('computeStats', () => {
  it('computes arrivals, landings, gate outcomes, median, flakes', () => {
    const events: JournalEvent[] = [
      { type: 'enqueued', pr: 1, at: '2026-07-17T01:00:00.000Z' },
      { type: 'enqueued', pr: 2, at: '2026-07-15T01:00:00.000Z' }, // > 24h ago
      { type: 'pr_state', pr: 1, state: 'LANDED', at: '2026-07-17T02:00:00.000Z' },
      { type: 'gate_metrics', batchId: 'a', seconds: 100, result: 'green', at: '2026-07-17T02:00:00.000Z' },
      { type: 'gate_metrics', batchId: 'b', seconds: 300, result: 'red', at: '2026-07-17T03:00:00.000Z' },
      { type: 'gate_metrics', batchId: 'c', seconds: 200, result: 'green', at: '2026-07-17T04:00:00.000Z' },
      { type: 'flake', testId: 't1', at: '2026-07-16T00:00:00.000Z' },
      { type: 'flake', testId: 't1', at: '2026-06-01T00:00:00.000Z' }, // stale
    ]
    expect(computeStats(events, NOW)).toEqual({
      arrivalsLast24h: 1,
      landedTotal: 1,
      gateRuns: { green: 2, red: 1, timeout: 0 },
      medianGateSeconds: 200,
      flakesLast7d: 1,
      gateCacheHits: 0,
      gateCacheSecondsSaved: 0,
      fullGatePlain: { runs: 0, medianSeconds: null },
      fullGateInstrumented: { runs: 0, medianSeconds: null },
    })
  })

  it('returns null median with no gate runs', () => {
    expect(computeStats([], NOW).medianGateSeconds).toBeNull()
  })

  it('averages the two middle values for an even-length gate sample', () => {
    const events: JournalEvent[] = [
      { type: 'gate_metrics', batchId: 'a', seconds: 100, result: 'green', at: '2026-07-17T02:00:00.000Z' },
      { type: 'gate_metrics', batchId: 'b', seconds: 300, result: 'green', at: '2026-07-17T03:00:00.000Z' },
    ]
    expect(computeStats(events, NOW).medianGateSeconds).toBe(200)
  })

  it('counts gate-cache hits, savings, and full-gate medians by instrumentation', () => {
    const events: JournalEvent[] = [
      { type: 'gate_cached', batchId: 'a', key: 'k', savedSeconds: 120, at: '2026-07-17T02:00:00.000Z' },
      { type: 'gate_cached', batchId: 'b', key: 'k', savedSeconds: 60, at: '2026-07-17T03:00:00.000Z' },
      { type: 'full_gate_recorded', tree: 't1', seconds: 100, instrumented: false, at: '2026-07-17T02:00:00.000Z' },
      { type: 'full_gate_recorded', tree: 't2', seconds: 300, instrumented: false, at: '2026-07-17T03:00:00.000Z' },
      { type: 'full_gate_recorded', tree: 't3', seconds: 500, instrumented: true, at: '2026-07-17T04:00:00.000Z' },
    ]
    const s = computeStats(events, NOW)
    expect(s.gateCacheHits).toBe(2)
    expect(s.gateCacheSecondsSaved).toBe(180)
    expect(s.fullGatePlain).toEqual({ runs: 2, medianSeconds: 200 })
    expect(s.fullGateInstrumented).toEqual({ runs: 1, medianSeconds: 500 })
  })
})
