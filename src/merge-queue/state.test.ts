import { describe, expect, it } from 'vitest'
import { reduceState, queuedPrs, TERMINAL_PR_STATES } from './state.js'

const at = (m: number) => `2026-07-17T00:${String(m).padStart(2, '0')}:00.000Z`

describe('reduceState', () => {
  it('creates a QUEUED entry on enqueued', () => {
    const s = reduceState([{ type: 'enqueued', pr: 1, at: at(0) }])
    expect(s.entries.get(1)).toEqual({ pr: 1, state: 'QUEUED', enqueuedAt: at(0), queueFailures: 0 })
  })

  it('ignores duplicate enqueue while non-terminal', () => {
    const s = reduceState([
      { type: 'enqueued', pr: 1, at: at(0) },
      { type: 'pr_state', pr: 1, state: 'IN_BATCH', batchId: 'b1', at: at(1) },
      { type: 'enqueued', pr: 1, at: at(2) },
    ])
    expect(s.entries.get(1)?.state).toBe('IN_BATCH')
    expect(s.entries.get(1)?.enqueuedAt).toBe(at(0))
  })

  it('re-enqueue after a terminal state resets state but keeps queueFailures', () => {
    const s = reduceState([
      { type: 'enqueued', pr: 1, at: at(0) },
      { type: 'pr_state', pr: 1, state: 'EJECTED', at: at(1), note: 'red' },
      { type: 'enqueued', pr: 1, at: at(2) },
    ])
    expect(s.entries.get(1)).toMatchObject({ state: 'QUEUED', enqueuedAt: at(2), queueFailures: 1 })
  })

  it('increments queueFailures only on EJECTED', () => {
    const s = reduceState([
      { type: 'enqueued', pr: 1, at: at(0) },
      { type: 'pr_state', pr: 1, state: 'REQUEUED_SPLIT', at: at(1) },
      { type: 'pr_state', pr: 1, state: 'EJECTED', at: at(2) },
    ])
    expect(s.entries.get(1)?.queueFailures).toBe(1)
  })

  it('tracks batches through their lifecycle', () => {
    const s = reduceState([
      { type: 'batch_created', batchId: 'b1', members: [1, 2], at: at(0) },
      { type: 'batch_state', batchId: 'b1', state: 'RUNNING', baseSha: 'abc', candidateTree: 'T', at: at(1) },
    ])
    expect(s.batches.get('b1')).toEqual({
      id: 'b1', state: 'RUNNING', members: [1, 2],
      candidateRef: 'refs/merge-queue/batch-b1', baseSha: 'abc', candidateTree: 'T',
    })
  })

  it('collects flake events', () => {
    const s = reduceState([{ type: 'flake', testId: 'src/a.test.ts', at: at(0) }])
    expect(s.flakes).toEqual([{ testId: 'src/a.test.ts', at: at(0) }])
  })

  it('ignores pr_state for unknown PRs (torn history) instead of crashing', () => {
    const s = reduceState([{ type: 'pr_state', pr: 9, state: 'TESTING', at: at(0) }])
    expect(s.entries.has(9)).toBe(false)
  })
})

describe('queuedPrs', () => {
  it('orders REQUEUED_SPLIT before QUEUED, each oldest-first', () => {
    const s = reduceState([
      { type: 'enqueued', pr: 1, at: at(0) },
      { type: 'enqueued', pr: 2, at: at(1) },
      { type: 'enqueued', pr: 3, at: at(2) },
      { type: 'pr_state', pr: 3, state: 'REQUEUED_SPLIT', at: at(3) },
    ])
    expect(queuedPrs(s).map(e => e.pr)).toEqual([3, 1, 2])
  })

  it('excludes terminal and in-flight states', () => {
    const s = reduceState([
      { type: 'enqueued', pr: 1, at: at(0) },
      { type: 'pr_state', pr: 1, state: 'LANDED', at: at(1) },
      { type: 'enqueued', pr: 2, at: at(2) },
      { type: 'pr_state', pr: 2, state: 'TESTING', at: at(3) },
    ])
    expect(queuedPrs(s)).toEqual([])
  })
})

describe('TERMINAL_PR_STATES', () => {
  it('contains exactly the four terminal states', () => {
    expect([...TERMINAL_PR_STATES].sort()).toEqual(['CANCELLED', 'EJECTED', 'LANDED', 'NEEDS_REBASE'])
  })
})
