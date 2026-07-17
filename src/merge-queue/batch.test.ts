import { describe, expect, it } from 'vitest'
import { composeBatch, riskScore, splitBatch } from './batch.js'
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
