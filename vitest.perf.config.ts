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
    // 30s is sized from the worst CI run measured for #813: 0.44ms/op median
    // over 4200 writes is ~1.8s, and even a runner spending most samples near
    // that run's 5.16ms p95 lands around 6s. It is a hang detector, not a
    // budget — the budgets in tests/performance/budgets.ts are the only thing
    // here making a statement about speed.
    testTimeout: 30_000,
  },
})
