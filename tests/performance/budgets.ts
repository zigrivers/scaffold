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
// Four changes make the numbers below meaningful:
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
//   4. The reported p95 is now actually a p95. It used to be index
//      `floor(15 * 0.95) = 14` of a 15-element sorted array — the maximum —
//      which is why the state-write budget kept tripping on single runner
//      stalls. See measure.ts.
//
// MEASURED, not guessed
// ---------------------
//
// Every number below comes from CI logs, never from a local run and never from
// a single sample. Two collections back them:
//
//   A. 27 attempts of the `check` job on ubuntu-latest, 2026-08-01/02, under the
//      OLD max-of-15 statistic. (25 latest attempts, plus the first attempts of
//      the two runs that were re-run: `gh run view --log` serves only the latest
//      attempt, so a budget failure that was re-run green is invisible there and
//      has to come from the attempts API.)
//   B. 5 runs of PR #813 on 2026-08-02, under the statistic measure.ts reports
//      now. The budgets are set from these.
//
// Collection B, per-op milliseconds, five ubuntu-latest runs:
//
//   benchmark            p95 range        median range     worst sample
//   ------------------   --------------   --------------   ------------
//   assembly             0.011 - 0.017    0.007 - 0.012          0.024
//   assembly (heavy)     0.019 - 0.031    0.012 - 0.021          0.046
//   state read           0.038 - 0.074    0.022 - 0.046          0.112
//   state write          0.179 - 5.158    0.151 - 0.439         11.614
//   build dep graph      13.6  - 21.9     7.7   - 13.7          30.08
//
// Read the SPREAD before touching a budget, not just the level. CPU-bound work
// is slower on CI than locally but tight; syscall-bound work is the opposite. A
// CI runner is not "a slow local machine", it is a different CPU-to-I/O cost
// mix, and anything derived from a single global slowdown factor will be wrong
// for half of these.
//
// Why state write budgets its MEDIAN and everything else budgets its p95
// ---------------------------------------------------------------------
//
// Look at the state-write row. Across five runs of identical code its p95 spans
// 29x — 0.179, 0.187, 0.202, 1.151, 5.158 — with a worst sample of 11.6ms
// against a healthy median of 0.15. Three runners were clean (worst sample
// within 20% of the median); two hit sustained write stalls. Raising the sample
// count from 15 to 41 did not tame this, which is what settled the question:
// the tail is the shared disk, not the code.
//
// A budget that survives 5.158 has to sit near 15ms — ~100x the healthy cost,
// detecting nothing. A budget that does not survive it flakes, which is what was
// happening. Either way the p95 of THIS benchmark on THIS runner fleet carries
// no information about our code, so it is reported and not asserted.
//
// The median does carry information. It moves 0.151 -> 0.439 across the same
// five runs (2.9x, and the 0.439 is the one genuinely slow runner) where the p95
// moves 29x — and a change that makes writes systematically slower moves it
// directly. So the write benchmark asserts its median and logs its p95.
//
// It also asserts a deliberately loose floor on its worst sample, because
// budgeting the median alone gives up a real thing: a change that inflates the
// tail without moving the middle would pass. That floor is 100ms and is not a
// performance budget in the sense the others are — see
// BUDGET_STATE_WRITE_MAX_MS below.
//
// The other four assert p95, because their tails are tight enough to mean
// something: state read's worst p95 is 2x its best, not 29x.
//
// Margins
// -------
//
// Each budget is 7-12x the WORST value collection B observed for the statistic
// that budget asserts. Set from the worst run rather than a typical one on
// purpose: every flake this file exists to prevent came from a worst run.
//
// What that buys, stated honestly: these are order-of-magnitude tripwires. A
// 4x regression passes — measured, not assumed: a deep-clone-per-section
// injected into assemble() cost 4x and did not trip these. They catch what
// actually regresses here: a re-parse per step, an accidental O(n^2) over the
// 99-step pipeline, a sync read that moved inside a loop.
//
// If a budget starts failing, read the WHOLE line the test logs — it prints n,
// min, median and max alongside the p95 — and compare it to the table above
// before touching the number. A run whose median matches the table and whose
// max does not is a runner stall, not a regression. Raising the constant to make
// the build green is how the suite got into the state described at the top.

/** Assembly of a realistic single-KB-entry prompt. Asserted on p95; CI worst p95 0.017ms/op. */
export const BUDGET_ASSEMBLY_MS = 0.2

/** Assembly with 10 KB entries + 5 read-back artifacts. Asserted on p95; CI worst p95 0.031ms/op. */
export const BUDGET_ASSEMBLY_HEAVY_MS = 0.25

/** state.json read + validate + migrate, 36 steps. Asserted on p95; CI worst p95 0.074ms/op. */
export const BUDGET_STATE_READ_MS = 0.6

/**
 * state.json serialize + atomic write, 36 steps.
 *
 * Asserted on the MEDIAN, not the p95 — see the long note above. CI worst median
 * is 0.439ms/op, so 3ms is ~7x that and ~20x a healthy runner's 0.15.
 */
export const BUDGET_STATE_WRITE_MEDIAN_MS = 3

/**
 * Structural-explosion floor for the same benchmark, asserted on the WORST
 * sample.
 *
 * Budgeting only the median gives up a real thing: a change that inflates the
 * tail without moving the middle — an extra flush on some inputs, an
 * intermittent second fsync — passes. This is the cheapest way to keep a floor
 * under that without re-importing the flake, and it is deliberately loose.
 *
 * 100ms is ~8.6x the worst sample five CI runs produced (11.614ms, on the
 * runner that was stalling) and ~500x a healthy runner's 0.2. It cannot detect
 * an ordinary regression and is not meant to: the median budget above does
 * that. This one only fires if the tail has changed by orders of magnitude,
 * which is the one tail change that is definitely ours and not the disk's.
 */
export const BUDGET_STATE_WRITE_MAX_MS = 100

/** Discover 99 meta-prompts, build the graph, detect cycles, toposort. Asserted on p95; CI worst p95 21.9ms/op. */
export const BUDGET_BUILD_GRAPH_MS = 150
