// Wall-clock budgets for the performance suite, and the reasoning behind the
// numbers — which matters more than the numbers.
//
// These files used to carry budgets copied from the PRD: 500ms for an assembly
// that takes 0.005ms, 100ms for a state read that takes 0.06ms, 2000ms for a
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
//   2. Each sample times a batch of calls (measure.ts). At 0.005ms per call a
//      p95 is a measurement of timer granularity and GC luck; batching lifts
//      each sample to milliseconds so the signal clears the noise.
//   3. Each benchmark asserts its input is real before timing it. Timing a
//      no-op is how the build benchmark passed for months.
//
// MEASURED, not guessed. Both columns are p95-per-op from a real run; the CI
// column is the `check` job on ubuntu-latest (run 30269189137, 2026-07-27):
//
//   benchmark          local (M-series)   CI (ubuntu-latest)   CI/local
//   ----------------   ----------------   ------------------   --------
//   assembly                    0.0046              0.0217        4.7x
//   assembly (heavy)            0.0090              0.0281        3.1x
//   state read                  0.055               0.0648        1.2x
//   state write                 0.27                0.2026        0.75x
//   build dep graph             9.3                21.96          2.4x
//
// Read the CI/local column before touching a budget: it is not one number.
// CPU-bound work runs 3-5x slower on CI; syscall-bound work runs the same speed
// or faster. That asymmetry is the same one that sank the ratio-based timing
// check this suite's cleanup started from — a CI runner is not "a slow local
// machine", it is a different CPU-to-I/O cost mix. Anything derived from a
// single global slowdown factor will be wrong for half these benchmarks.
//
// Each budget below is ~7-10x the CI-observed p95. That margin absorbs runner
// variance (one CI sample informs it, so it is deliberately generous) while
// still leaving a real detection threshold: roughly 7-10x on CI, 20-45x local.
//
// What that buys, stated honestly: these are order-of-magnitude tripwires. A
// 4x regression passes — measured, not assumed: a deep-clone-per-section
// injected into assemble() cost 4x and did not trip these. They catch what
// actually regresses here: a re-parse per step, an accidental O(n^2) over the
// 99-step pipeline, a sync read that moved inside a loop. Each budget was
// verified to fail against an injected slowdown of that magnitude, and to pass
// again when it was reverted.
//
// If a budget starts failing, read the p95 the test logs before touching the
// number, and compare it to the table above. Raising the constant to make the
// build green is how the suite got into the state described at the top.

/** Assembly of a realistic single-KB-entry prompt. CI p95 ~0.022ms/op. */
export const BUDGET_ASSEMBLY_MS = 0.2

/** Assembly with 10 KB entries + 5 read-back artifacts. CI p95 ~0.028ms/op. */
export const BUDGET_ASSEMBLY_HEAVY_MS = 0.25

/** state.json read + validate + migrate, 36 steps. CI p95 ~0.065ms/op. */
export const BUDGET_STATE_READ_MS = 0.6

/** state.json serialize + atomic write, 36 steps. CI p95 ~0.20ms/op. */
export const BUDGET_STATE_WRITE_MS = 2

/** Discover 99 meta-prompts, build the graph, detect cycles, toposort. CI p95 ~22ms/op. */
export const BUDGET_BUILD_GRAPH_MS = 150
