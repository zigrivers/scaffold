import { describe, it, expect } from 'vitest'
import { runDoctor } from './run.js'
import type { DoctorCheck, DoctorStatus } from './types.js'

function fakeCheck(id: string, status: DoctorStatus): DoctorCheck {
  return {
    id, section: 'queue', title: id,
    run: () => ({ id, section: 'queue', title: id, status, detail: id }),
  }
}

describe('runDoctor (D5)', () => {
  it('exit code 0 when all checks are ok or skipped', () => {
    const report = runDoctor('/tmp', { checks: [fakeCheck('a', 'ok'), fakeCheck('b', 'skip')] })
    expect(report.exitCode).toBe(0)
    expect(report.verdict).toBe('healthy')
  })

  it('exit code 1 on warnings, 2 on errors — skips never affect it', () => {
    expect(runDoctor('/tmp', { checks: [fakeCheck('a', 'warn'), fakeCheck('b', 'skip')] }).exitCode).toBe(1)
    expect(runDoctor('/tmp', { checks: [fakeCheck('a', 'warn'), fakeCheck('b', 'error')] }).exitCode).toBe(2)
  })

  it('exit code 0 when every check skips', () => {
    const report = runDoctor('/tmp', { checks: [fakeCheck('a', 'skip'), fakeCheck('b', 'skip')] })
    expect(report.exitCode).toBe(0)
    expect(report.verdict).toBe('healthy')
  })

  it('a crashing check reports error instead of aborting the run', () => {
    const crashing: DoctorCheck = {
      id: 'x', section: 'gate', title: 'x',
      run: () => { throw new Error('boom') },
    }
    const report = runDoctor('/tmp', { checks: [crashing, fakeCheck('a', 'ok')] })
    expect(report.results[0].status).toBe('error')
    expect(report.results[0].detail).toContain('boom')
    expect(report.results).toHaveLength(2)
  })

  it('--fix invokes fix() on failing checks only and re-runs after an applied fix', () => {
    let fixed = false
    const check: DoctorCheck = {
      id: 'beads/live', section: 'beads', title: 'x',
      run: () => ({
        id: 'beads/live', section: 'beads', title: 'x',
        status: fixed ? 'ok' : 'error', detail: fixed ? 'answers' : 'failed',
      }),
      fix: () => { fixed = true; return { applied: true, detail: 'bd doctor --fix completed' } },
    }
    const report = runDoctor('/tmp', { checks: [check], fix: true })
    expect(report.results[0].status).toBe('ok')
    expect(report.results[0].detail).toContain('after fix')
    expect(report.exitCode).toBe(0)
  })
})
