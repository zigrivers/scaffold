// Wall-clock budgets for the performance suite, and the reasoning behind the
// numbers — which matters more than the numbers.
//
// These files used to carry budgets copied from the PRD: 500ms for an assembly
// that takes 0.004ms, 100ms for a state read that takes 0.06ms, 2000ms for a
// dependency-graph build that took 0.2ms because it was pointed at a directory
// that no longer existed and was timing an empty graph. Headroom ran from 175x
// to "cannot fail for any reason". The suite was green by construction rather
// than by evidence.
//
// Three changes make the numbers below meaningful:
//
//   1. The suite runs in its own vitest process (vitest.perf.config.ts), single
//      fork, no file parallelism. A wall-clock budget measured inside the
//      ~4000-case parallel unit run is a measurement of the scheduler. See
//      src/project/adoption-apply.write-cost.test.ts for the long version.
//   2. Each sample times a batch of calls (measure.ts). At 0.004ms per call a
//      p95 is a measurement of timer granularity and GC luck; batching lifts
//      each sample to milliseconds so the signal clears the noise.
//   3. Each benchmark asserts its input is real before timing it. Timing a
//      no-op is how the build benchmark passed for months.
//
// The budgets are set at roughly 30-50x the p95 measured on a developer Mac.
// That multiplier is not timidity, it is the CI datapoint: on ubuntu-latest,
// the same CPU-bound path ran 3x slower than local while the syscall-bound path
// ran the same speed (measured during the adopt write-cost work). A multiplier
// under ~10x would turn "GitHub gave us a slow runner" into a failing build —
// the exact false alarm this suite was cleaned up to stop producing.
//
// What that buys, stated honestly: these are order-of-magnitude tripwires. They
// will not notice a 2x slowdown. They will notice the regressions that actually
// happen here — a re-parse per step, an accidental O(n^2) over the pipeline, a
// sync read that moved inside a loop — because those cost 30x to 1000x, not 2x.
// Every budget below was verified to fail against an injected regression of
// that kind before being committed.
//
// If a budget starts failing, read the p95 the test logs before touching the
// number. A 30x jump is a real regression. Raising the constant to make the
// build green is how the suite got into the state described above.

/** Assembly of a realistic single-KB-entry prompt. Local p95 ~0.004ms/op. */
export const BUDGET_ASSEMBLY_MS = 0.25

/** Assembly with 10 KB entries + 5 read-back artifacts. Local p95 ~0.01ms/op. */
export const BUDGET_ASSEMBLY_HEAVY_MS = 0.6

/** state.json read + validate + migrate, 36 steps. Local p95 ~0.06ms/op. */
export const BUDGET_STATE_READ_MS = 3

/** state.json serialize + atomic write, 36 steps. Local p95 ~0.29ms/op. */
export const BUDGET_STATE_WRITE_MS = 10

/** Discover 99 meta-prompts, build the graph, detect cycles, toposort. Local p95 ~9.7ms/op. */
export const BUDGET_BUILD_GRAPH_MS = 300
