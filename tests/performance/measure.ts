/**
 * Time `op` and report the p95 cost of ONE call, in milliseconds.
 *
 * Each sample times a batch of `batch` calls rather than a single call. That
 * matters: assembling one prompt takes ~0.02ms, and at that scale a p95 is a
 * measurement of timer granularity and GC luck, not of the code. Two runs of
 * the identical function differed 3x here. Batching to a few milliseconds per
 * sample pushes the noise below the signal, which is what makes it defensible
 * to set a budget nearer the real cost instead of 1000x above it.
 *
 * The returned number is still per-call, so budgets stay readable and stay
 * comparable if `batch` is ever retuned.
 *
 * `warmup` defaults to one batch, which is the right trade for the
 * microsecond-scale benchmarks but would cost a full second on an op that
 * already takes ~10ms. Callers passing a small `batch` (the dependency-graph
 * build passes 1) get a proportionally small warmup for free; pass `warmup`
 * explicitly if the two need to diverge.
 */
export function p95PerOpMs(
  op: () => void,
  { batch = 100, samples = 15, warmup = batch } = {},
): number {
  // Let the JIT settle so sample 1 is not measuring compilation.
  for (let i = 0; i < warmup; i++) op()

  const perOp: number[] = []
  for (let s = 0; s < samples; s++) {
    const start = performance.now()
    for (let i = 0; i < batch; i++) op()
    perOp.push((performance.now() - start) / batch)
  }

  perOp.sort((a, b) => a - b)
  return perOp[Math.floor(perOp.length * 0.95)]
}
