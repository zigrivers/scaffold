import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AdapterStatus, BaseAdapter } from './types.js'
import type { ReplayEvent } from '../engine/types.js'

export interface TestResult {
  name: string
  file_path: string
  status: 'passing' | 'failing' | 'skipped' | 'unknown'
}

export interface TestRun {
  ran_at: string
  passed: number
  failed: number
  results: TestResult[]
}

const REL = '.scaffold/last-test-run.json'

export const testsAdapter: BaseAdapter & {
  lastRun(cwd: string): Promise<TestRun | null>
  replayEvents(cwd: string, opts: { sinceHours: number }): Promise<ReplayEvent[]>
} = {
  id: 'tests',

  async probe(cwd: string): Promise<AdapterStatus> {
    try {
      await access(join(cwd, REL))
    } catch {
      return { status: 'unavailable', reason: 'no cached test run; run tests to populate' }
    }
    return { status: 'available', evidence_paths: [REL] }
  },

  async lastRun(cwd: string): Promise<TestRun | null> {
    try {
      return JSON.parse(await readFile(join(cwd, REL), 'utf8')) as TestRun
    } catch {
      return null
    }
  },

  async replayEvents(cwd: string, opts: { sinceHours: number }): Promise<ReplayEvent[]> {
    const run = await testsAdapter.lastRun(cwd)
    if (!run) return []
    const cutoff = new Date(Date.now() - opts.sinceHours * 3_600_000).toISOString()
    if (run.ran_at < cutoff) return []
    const out: ReplayEvent[] = [{
      sort_id: `tests:run:${run.ran_at}`,
      correlation_id: null,
      ts: run.ran_at,
      source: 'tests', kind: 'test_run_completed',
      summary: `tests: ${run.passed} passed, ${run.failed} failed`,
    }]
    if (run.failed > 0) {
      const firstFail = run.results.find((r) => r.status === 'failing')
      if (firstFail) {
        out.push({
          sort_id: `tests:fail:${firstFail.file_path}:${firstFail.name}`,
          correlation_id: null,
          ts: run.ran_at,
          source: 'tests', kind: 'test_run_failed',
          summary: `failing: ${firstFail.name} (${firstFail.file_path})`,
        })
      }
    }
    return out
  },
}
