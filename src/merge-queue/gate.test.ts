import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runGate } from './gate.js'

function tmp(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'mq-gate-')) }
function logIn(dir: string): string { return path.join(dir, 'gate.log') }

describe('runGate', () => {
  it('green on exit 0, captures the log', () => {
    const dir = tmp()
    const res = runGate({ cwd: dir, command: 'echo hello', timeoutMs: 10_000, logPath: logIn(dir) })
    expect(res.result).toBe('green')
    expect(fs.readFileSync(res.logPath, 'utf8')).toContain('hello')
    expect(res.failedTests).toEqual([])
  })

  it('red on non-zero exit, reads and clears the failed-tests contract file', () => {
    const dir = tmp()
    const res = runGate({
      cwd: dir,
      command: 'printf "src/a.test.ts\\nsrc/b.test.ts\\n" > .mq-failed-tests.txt; exit 1',
      timeoutMs: 10_000,
      logPath: logIn(dir),
    })
    expect(res.result).toBe('red')
    expect(res.failedTests).toEqual(['src/a.test.ts', 'src/b.test.ts'])
    expect(fs.existsSync(path.join(dir, '.mq-failed-tests.txt'))).toBe(false)
  })

  it('timeout kills the command', () => {
    const dir = tmp()
    const started = Date.now()
    const res = runGate({ cwd: dir, command: 'sleep 30', timeoutMs: 1_000, logPath: logIn(dir) })
    expect(res.result).toBe('timeout')
    expect(Date.now() - started).toBeLessThan(10_000)
  })

  it('passes env through (retry contract)', () => {
    const dir = tmp()
    const res = runGate({
      cwd: dir,
      command: 'test "$MQ_RETRY_TESTS" = "src/a.test.ts"',
      timeoutMs: 10_000,
      logPath: logIn(dir),
      env: { MQ_RETRY_TESTS: 'src/a.test.ts' },
    })
    expect(res.result).toBe('green')
  })
})
