import { access, readFile } from 'node:fs/promises'
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
}
