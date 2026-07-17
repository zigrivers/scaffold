import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { appendEvent } from './journal.js'
import type { QueueState } from './types.js'

export const QUARANTINE_THRESHOLD = 3
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export function recordFlake(mqDir: string, testId: string, at: string): void {
  appendEvent(mqDir, { type: 'flake', testId, at })
}

export function recentFlakeCount(state: QueueState, testId: string, now: Date): number {
  const cutoff = now.getTime() - WINDOW_MS
  return state.flakes.filter(f => f.testId === testId && Date.parse(f.at) >= cutoff).length
}

export function addToQuarantine(
  projectRoot: string,
  quarantinePath: string,
  testId: string,
): boolean {
  const file = path.join(projectRoot, quarantinePath)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const existing = fs.existsSync(file)
    ? fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim() !== '')
    : []
  if (existing.includes(testId)) return false
  fs.appendFileSync(file, testId + '\n')
  return true
}

export function fileQuarantineBead(projectRoot: string, testId: string): void {
  try {
    execFileSync('bd', [
      'create',
      `Quarantined flaky test: ${testId}`,
      '-d',
      `Auto-filed by scaffold mq: ${QUARANTINE_THRESHOLD}+ flake events in 7 days. ` +
      'The test is excluded from the merge gate (see .mq/quarantine.txt) and still runs ' +
      'post-merge. Fix the flake, then remove it from the quarantine list.',
    ], { cwd: projectRoot, stdio: 'ignore' })
  } catch {
    // bd absent or errored — advisory only, never fatal (spec: feature-detect).
  }
}
