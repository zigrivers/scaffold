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
  },
})
