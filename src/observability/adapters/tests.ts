import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AdapterStatus, BaseAdapter } from './types.js'

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
} = {
  id: 'tests',

  async probe(cwd: string): Promise<AdapterStatus> {
    if (!existsSync(join(cwd, REL))) {
      return { status: 'unavailable', reason: 'no cached test run; run tests to populate' }
    }
    return { status: 'available', evidence_paths: [REL] }
  },

  async lastRun(cwd: string): Promise<TestRun | null> {
    const p = join(cwd, REL)
    if (!existsSync(p)) return null
    try {
      return JSON.parse(readFileSync(p, 'utf8')) as TestRun
    } catch {
      return null
    }
  },
}
