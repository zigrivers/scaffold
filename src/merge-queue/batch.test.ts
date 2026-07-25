import { describe, expect, it } from 'vitest'
import { composeBatch, riskScore, splitBatch, touchesOverlapZone } from './batch.js'
import type { PrEntry } from './types.js'

const entry = (pr: number, queueFailures = 0): PrEntry => ({
  pr, state: 'QUEUED', enqueuedAt: '2026-07-17T00:00:00.000Z', queueFailures,
})

describe('riskScore', () => {
  it('is diff size plus a heavy penalty per prior queue failure', () => {
    expect(riskScore(entry(1), { additions: 10, deletions: 5 })).toBe(15)
    expect(riskScore(entry(1, 2), { additions: 10, deletions: 5 })).toBe(2015)
  })
})

describe('composeBatch', () => {
  it('orders low-risk first and respects the cap', () => {
    const infos = new Map([
      [1, { additions: 500, deletions: 0 }],
      [2, { additions: 5, deletions: 0 }],
      [3, { additions: 50, deletions: 0 }],
    ])
    expect(composeBatch([entry(1), entry(2), entry(3)], infos, 2)).toEqual([2, 3])
  })

  it('treats missing info as high risk (sorts last) rather than crashing', () => {
    const infos = new Map([[2, { additions: 5, deletions: 0 }]])
    expect(composeBatch([entry(1), entry(2)], infos, 5)).toEqual([2, 1])
  })
})

describe('composeBatch — conflict-aware partitioning (D13)', () => {
  const infos = new Map([
    [1, { additions: 1, deletions: 0 }],
    [2, { additions: 2, deletions: 0 }],
    [3, { additions: 3, deletions: 0 }],
  ])

  it('overlapping PRs never share a batch; disjoint later PRs still join', () => {
    const files = new Map<number, string[] | null>([
      [1, ['src/a.ts']], [2, ['src/a.ts', 'src/b.ts']], [3, ['src/c.ts']],
    ])
    expect(composeBatch([entry(1), entry(2), entry(3)], infos, 5, { files })).toEqual([1, 3])
  })

  it('preserves low-risk-first anchoring', () => {
    const files = new Map<number, string[] | null>([[1, ['x.ts']], [2, ['x.ts']]])
    // 1 is lower risk -> anchors the batch; 2 overlaps and waits its turn.
    expect(composeBatch([entry(2), entry(1)], infos, 5, { files })).toEqual([1])
  })

  it('an unknown file set (null) is solo-only: anchors alone, never joins', () => {
    const files = new Map<number, string[] | null>([
      [1, ['a.ts']], [2, null], [3, ['c.ts']],
    ])
    expect(composeBatch([entry(1), entry(2), entry(3)], infos, 5, { files })).toEqual([1, 3])
    expect(composeBatch([entry(2), entry(3)], infos, 5, { files })).toEqual([2])
  })

  it('a PR absent from a provided files map is treated as unknown (solo-only)', () => {
    const files = new Map<number, string[] | null>([[1, ['a.ts']]])
    expect(composeBatch([entry(1), entry(2)], infos, 5, { files })).toEqual([1])
  })

  it('a zone-touching PR is batched alone even against disjoint peers', () => {
    const files = new Map<number, string[] | null>([
      [1, ['migrations/001.sql']], [2, ['src/b.ts']],
    ])
    expect(composeBatch([entry(1), entry(2)], infos, 5, {
      files, overlapZones: ['migrations/**'],
    })).toEqual([1])
    // ...and it cannot JOIN a batch anchored by someone else. pr1 carries a
    // queueFailures penalty here so pr2 — lower risk in THIS call — anchors
    // first; pr1's zone touch then correctly blocks it from joining. (With
    // both PRs at default risk, pr1 always sorts first regardless of queued
    // array order, which would make this half of the assertion unreachable —
    // see task-9-report.md for detail.)
    expect(composeBatch([entry(2), entry(1, 1)], infos, 5, {
      files, overlapZones: ['migrations/**'],
    })).toEqual([2])
  })

  it('omitting the files map preserves the legacy no-partitioning behavior', () => {
    expect(composeBatch([entry(1), entry(2), entry(3)], infos, 2)).toEqual([1, 2])
  })
})

describe('touchesOverlapZone', () => {
  it('matches minimatch globs including dotfiles', () => {
    expect(touchesOverlapZone(['migrations/001.sql'], ['migrations/**'])).toBe(true)
    expect(touchesOverlapZone(['index.html'], ['index.html'])).toBe(true)
    expect(touchesOverlapZone(['.github/workflows/ci.yml'], ['.github/**'])).toBe(true)
    expect(touchesOverlapZone(['src/a.ts'], ['migrations/**'])).toBe(false)
    expect(touchesOverlapZone(['src/a.ts'], [])).toBe(false)
  })
})

describe('splitBatch', () => {
  it('splits into two non-empty halves', () => {
    expect(splitBatch([1, 2, 3, 4])).toEqual([[1, 2], [3, 4]])
    expect(splitBatch([1, 2, 3])).toEqual([[1], [2, 3]])
    expect(splitBatch([1, 2])).toEqual([[1], [2]])
  })

  it('throws on fewer than 2 members (callers eject singletons instead)', () => {
    expect(() => splitBatch([1])).toThrow(/singleton/i)
  })
})
