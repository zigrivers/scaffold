import { defineConfig } from 'vitest/config'

// The performance suite runs as its own process, like the e2e suite, and for a
// related reason: it measures wall-clock time, and wall-clock time measured
// inside the ~4000-case parallel unit run is a measurement of the scheduler.
// (See src/project/adoption-apply.write-cost.test.ts for the full write-up of
// how that failure mode looks when it is not isolated.)
//
// `fileParallelism: false` plus a single fork means the three benchmark files
// also do not contend with each other, so a budget here is a statement about
// the code rather than about how busy the box was.
//
// Standalone rather than mergeConfig(baseConfig, …), matching
// vitest.e2e.config.ts. That is safe only because vitest.config.ts defines no
// plugins, no resolve.alias, no setupFiles and no define globals — there is
// nothing here to inherit. If any of those are ever added to the base config,
// this file and vitest.e2e.config.ts both need to start extending it, or the
// perf suite will fail to resolve imports that the unit suite resolves fine.
export default defineConfig({
  test: {
    include: ['tests/performance/**/*.test.ts'],
    fileParallelism: false,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    // Deliberately NOT passWithNoTests. If the glob above ever stops matching,
    // this run must fail loudly — a perf suite that silently measures nothing
    // is the exact bug these files were fixed for.
    passWithNoTests: false,
    // Vitest's 5s default is too small for these benchmarks, and the margin got
    // thin without anyone noticing: raising the sample count from 15 to 41
    // (#813) took the state-write case from ~1600 writes to ~4200. On an
    // unloaded runner that is ~2s and passes, which is why CI stayed green —
    // but running the suite on a busy machine times out at 5s, and the failure
    // reads as "Test timed out", not as anything about performance.
    //
    // 60s is sized so the worst runner #813 measured cannot trip it. Total wall
    // time is driven by the MEAN per-op cost, which those runs did not record,
    // so the number comes from a bound that needs no mean: 41 samples x 100
    // writes plus warmup is 4200 ops, and if EVERY one of them cost what the
    // worst single sample cost on the worst run (11.6ms/op) the case takes
    // ~49s. For scale, the same arithmetic at that run's median is ~1.8s, and
    // idle on a developer Mac it measures 783ms.
    //
    // A tighter 30s was the first attempt, justified with "a runner near the
    // 5.16ms p95 lands around 6s". That is wrong twice over — 5.16ms x 4200 is
    // 21.7s, and a p95 is the top 5% rather than a stand-in for the mean. Both
    // review channels caught it. The corrected figure is above.
    //
    // This is a hang detector, not a budget. The budgets in
    // tests/performance/budgets.ts make the only statements here about speed,
    // and a timeout that fires on a legitimately slow runner would report
    // "Test timed out" — which is exactly the misleading failure this replaced.
    testTimeout: 60_000,
  },
})
