/**
 * Time `op` and report the per-call cost distribution, in milliseconds.
 *
 * Each sample times a batch of `batch` calls rather than a single call. That
 * matters: assembling one prompt takes ~0.02ms, and at that scale a p95 is a
 * measurement of timer granularity and GC luck, not of the code. Two runs of
 * the identical function differed 3x here. Batching to a few milliseconds per
 * sample pushes the noise below the signal, which is what makes it defensible
 * to set a budget nearer the real cost instead of 1000x above it.
 *
 * The returned numbers are still per-call, so budgets stay readable and stay
 * comparable if `batch` is ever retuned.
 *
 * `warmup` defaults to one batch, which is the right trade for the
 * microsecond-scale benchmarks but would cost a full second on an op that
 * already takes ~10ms. Callers passing a small `batch` (the dependency-graph
 * build passes 1) get a proportionally small warmup for free; pass `warmup`
 * explicitly if the two need to diverge.
 *
 * ## Why the sample floor exists
 *
 * This used to take 15 samples and index `floor(15 * 0.95) = 14` — the LAST
 * element of a 15-element sorted array. That is the maximum, not a p95, under
 * any definition. It went unnoticed for the CPU-bound benchmarks, where the
 * distribution is tight enough that the two nearly coincide.
 *
 * It did not go unnoticed for state writes. Those are fsync-bound on a shared
 * CI disk, and their distribution has a long right tail: across 27 CI attempts
 * the median was 0.23ms/op and two attempts read 3.70 and 4.56 — 16-20x — while
 * every other benchmark in those same two runs came in FASTER than its median.
 * That is a runner I/O stall landing in one batch, and a max-of-15 reports it
 * as the headline number. Both attempts failed the budget and were re-run
 * green.
 *
 * A budget is meant to catch a code change that shifts the whole distribution,
 * not a single stalled syscall. A real p95 does that; a maximum cannot. So the
 * sample count must be large enough that the p95 rank has samples above it, and
 * `perOpStatsMs` refuses to run otherwise rather than silently reporting a
 * maximum under a p95 label.
 */

/** Samples above the p95 rank that a call must leave room for. */
const MIN_SAMPLES_ABOVE_P95 = 2

/** Nearest-rank p95 index into a sorted array of `n` samples. */
export function p95Index(n: number): number {
  return Math.ceil(n * 0.95) - 1
}

/**
 * Smallest sample count whose p95 rank leaves `MIN_SAMPLES_ABOVE_P95` above it.
 *
 * Searched against the same predicate the guard uses rather than derived from a
 * formula. `Math.ceil((MIN_SAMPLES_ABOVE_P95 + 1) / 0.05)` looks like the answer
 * and says 60; the real answer is 40, because `n - 1 - p95Index(n)` is a step
 * function and 0.95 is not exact in binary (39 * 0.95 is 37.05, 40 * 0.95 is
 * exactly 38). A hint that overstates the requirement by 50% is a worse error
 * message than no hint.
 */
export function minSamplesForP95(): number {
  for (let n = MIN_SAMPLES_ABOVE_P95 + 1; n <= 1000; n++) {
    if (n - 1 - p95Index(n) >= MIN_SAMPLES_ABOVE_P95) return n
  }
  /* c8 ignore next -- unreachable: the gap grows ~0.05 per sample */
  throw new Error('minSamplesForP95: no sample count satisfies the p95 rank guard')
}

/** True median: the average of the two middle samples when `n` is even. */
export function medianOf(sorted: readonly number[]): number {
  // Without this an empty array reads `sorted[-1]` and returns NaN, and NaN
  // fails every `toBeLessThan` silently-looking way. Exported, so guard it.
  if (sorted.length === 0) throw new Error('medianOf: no samples')
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

export interface PerOpStats {
  /** Nearest-rank p95 of the per-call sample costs, in ms. The budgeted number. */
  p95: number
  min: number
  median: number
  max: number
  samples: number
  /** One-line log form, so every benchmark reports the distribution identically. */
  summary: string
}

/**
 * `samples` defaults to 41, one above the 40 `minSamplesForP95` reports.
 *
 * Not an off-by-one. An odd count makes the median an actual observed sample
 * rather than the average of two, and it keeps the default off the exact
 * boundary of the guard, so a future change to MIN_SAMPLES_ABOVE_P95 surfaces
 * as a failing test rather than as every caller landing on the new minimum.
 *
 * `batch` and `samples` are also the values every budget in budgets.ts was
 * MEASURED against. Retuning either changes the distribution the budgets
 * describe — most of all for state writes, where batch x samples is the total
 * fsync count — so a change here means re-deriving those numbers from CI, not
 * just re-running the suite.
 */
export function perOpStatsMs(
  op: () => void,
  { batch = 100, samples = 41, warmup = batch, digits = 4 } = {},
): PerOpStats {
  // Let the JIT settle so sample 1 is not measuring compilation.
  for (let i = 0; i < warmup; i++) op()

  const perOp: number[] = []
  for (let s = 0; s < samples; s++) {
    const start = performance.now()
    for (let i = 0; i < batch; i++) op()
    perOp.push((performance.now() - start) / batch)
  }

  perOp.sort((a, b) => a - b)
  // Nearest rank: the smallest value at or above the 95th percentile.
  const idx = p95Index(perOp.length)
  const above = perOp.length - 1 - idx
  if (above < MIN_SAMPLES_ABOVE_P95) {
    throw new Error(
      `perOpStatsMs: ${samples} samples puts the p95 rank ${above} sample(s) from the top, `
      + 'so it reports a maximum rather than a p95. Use at least '
      + `${minSamplesForP95()} samples.`,
    )
  }

  const p95 = perOp[idx]!
  const stats = {
    p95,
    min: perOp[0]!,
    // A real median, not the lower-middle element. The write benchmark now
    // ASSERTS this number, so an even `samples` must not quietly under-report.
    median: medianOf(perOp),
    max: perOp[perOp.length - 1]!,
    samples: perOp.length,
  }
  const f = (v: number) => v.toFixed(digits)
  return {
    ...stats,
    // `p95=` stays first. Re-deriving a budget means grepping this line out of
    // CI logs by hand (budgets.ts describes the collection), so keep the token
    // leading and keep the numbers in one line per benchmark.
    summary: `p95=${f(p95)}ms/op (n=${stats.samples} min=${f(stats.min)} `
      + `med=${f(stats.median)} max=${f(stats.max)})`,
  }
}
