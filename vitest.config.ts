import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // src/e2e/** is excluded and run as its own vitest process via
    // `npm run test:e2e` (wired into `make ts-check`). Those cases each spawn
    // the real CLI as a subprocess; sharing a worker pool with the ~4000-case
    // unit run starved vitest's reporter RPC and produced
    // "[vitest-worker]: Timeout calling onTaskUpdate" — a CI failure with
    // every test passing. Separate process, no contention.
    // tests/performance/** is excluded for the same reason as src/e2e/**: it is
    // run as its own vitest process (`npm run test:perf`, wired into
    // `make ts-check`). Those files assert wall-clock budgets, and a budget
    // measured while ~4000 other cases saturate the worker pool reports
    // scheduler contention as a performance regression. See vitest.perf.config.ts.
    exclude: ['tests/e2e/**', 'tests/bench/**', 'src/e2e/**', 'tests/performance/**'],
    typecheck: {
      include: ['src/**/*.test-d.ts'],
    },
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        statements: 84,
        branches: 80,
        functions: 88,
        lines: 84,
      },
    },
  },
})
