import { describe, it, expect } from 'vitest'
import { perOpStatsMs, p95Index, minSamplesForP95, medianOf } from './measure.js'

// The arithmetic in measure.ts, pinned directly.
//
// This suite exists because the bug it was written for was invisible from the
// benchmarks: `floor(15 * 0.95) = 14` returned the maximum of a 15-element
// array under a p95 label, and every benchmark just reported a slightly larger
// number. Nothing failed. The budgets absorbed it until state writes — the one
// benchmark with a long tail — started tripping on runner stalls.
//
// So the statistics get their own assertions against known inputs, where a
// wrong index is a failure rather than a shifted number. These are pure and
// take microseconds; they live in the perf suite only to sit beside the code
// they cover (tests/performance/** is excluded from the unit run).
describe('p95Index', () => {
  it('is nearest-rank: the smallest index at or above the 95th percentile', () => {
    // 20 samples: the 95th percentile is the 19th of 20, index 18.
    expect(p95Index(20)).toBe(18)
    // 40: exactly 38.0, so the 38th of 40, index 37 — two samples above it.
    expect(p95Index(40)).toBe(37)
    expect(p95Index(41)).toBe(38)
  })

  it('returns the LAST index for small n — the bug this file exists for', () => {
    // The old code used floor() and 15 samples, landing here. Pinned so the
    // shape of the mistake stays visible: at n=15 a p95 IS the maximum, which
    // is why the guard below refuses to run there.
    expect(p95Index(15)).toBe(14)
    expect(15 - 1 - p95Index(15)).toBe(0)
  })
})

describe('minSamplesForP95', () => {
  it('is 40, not the 60 the obvious formula gives', () => {
    expect(minSamplesForP95()).toBe(40)
    // The formula that looks right. Kept as a live assertion rather than a
    // comment so the discrepancy cannot quietly stop being true.
    expect(Math.ceil((2 + 1) / 0.05)).toBe(60)
  })

  it('is the FIRST count that satisfies the guard', () => {
    const above = (m: number) => m - 1 - p95Index(m)
    const n = minSamplesForP95()
    expect(above(n)).toBeGreaterThanOrEqual(2)
    expect(above(n - 1)).toBeLessThan(2)
  })
})

describe('medianOf', () => {
  it('takes the middle sample when the count is odd', () => {
    expect(medianOf([1, 2, 3, 4, 5])).toBe(3)
  })

  it('averages the two middle samples when the count is even', () => {
    // The lower-middle element (2) would be wrong, and wrong in the direction
    // that under-reports — which matters now that a budget asserts the median.
    expect(medianOf([1, 2, 4, 8])).toBe(3)
  })

  it('handles a single sample', () => {
    expect(medianOf([7])).toBe(7)
  })

  it('throws on no samples rather than returning NaN', () => {
    // NaN would fail every `toBeLessThan` in a way that looks like a real
    // budget breach, which is a worse failure than an explicit throw.
    expect(() => medianOf([])).toThrow(/no samples/)
  })
})

describe('perOpStatsMs', () => {
  it('refuses a sample count that would report a maximum as a p95', () => {
    expect(() => perOpStatsMs(() => {}, { batch: 1, samples: 15, warmup: 0 }))
      .toThrow(/reports a maximum rather than a p95/)
    // And the hint it gives must be a count that actually works.
    expect(() => perOpStatsMs(() => {}, { batch: 1, samples: 15, warmup: 0 }))
      .toThrow(/at least 40 samples/)
  })

  it('accepts the count its own error message recommends', () => {
    expect(() => perOpStatsMs(() => {}, {
      batch: 1, samples: minSamplesForP95(), warmup: 0,
    })).not.toThrow()
  })

  it('reports a distribution whose parts are ordered and self-consistent', () => {
    // No timing assertion — an empty op on a busy box can produce anything.
    // What must hold is the SHAPE: min <= median <= p95 <= max, the sample
    // count is what was asked for, and the summary quotes the same numbers.
    const stats = perOpStatsMs(() => {}, { batch: 10, samples: 41, warmup: 0, digits: 4 })

    expect(stats.samples).toBe(41)
    expect(stats.min).toBeLessThanOrEqual(stats.median)
    expect(stats.median).toBeLessThanOrEqual(stats.p95)
    expect(stats.p95).toBeLessThanOrEqual(stats.max)
    expect(stats.summary).toBe(
      `p95=${stats.p95.toFixed(4)}ms/op (n=41 min=${stats.min.toFixed(4)} `
      + `med=${stats.median.toFixed(4)} max=${stats.max.toFixed(4)})`,
    )
  })

  it('honours the digits option so a slow benchmark can log fewer decimals', () => {
    const stats = perOpStatsMs(() => {}, { batch: 1, samples: 41, warmup: 0, digits: 2 })
    expect(stats.summary).toMatch(/^p95=\d+\.\d{2}ms\/op \(n=41 /)
  })
})
