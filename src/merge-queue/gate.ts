import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export interface GateResult {
  result: 'green' | 'red' | 'timeout'
  seconds: number
  logPath: string
  failedTests: string[]
}

const FAILED_TESTS_FILE = '.mq-failed-tests.txt'

export function runGate(opts: {
  cwd: string
  command: string
  timeoutMs: number
  logPath: string
  env?: Record<string, string>
}): GateResult {
  fs.mkdirSync(path.dirname(opts.logPath), { recursive: true })
  const started = Date.now()
  const proc = spawnSync('bash', ['-lc', opts.command], {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    timeout: opts.timeoutMs,
    killSignal: 'SIGKILL',
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const seconds = Math.round((Date.now() - started) / 1000)
  fs.writeFileSync(opts.logPath, (proc.stdout ?? '') + (proc.stderr ?? ''))

  const timedOut = proc.error !== undefined &&
    (proc.error as NodeJS.ErrnoException).code === 'ETIMEDOUT'

  const failedFile = path.join(opts.cwd, FAILED_TESTS_FILE)
  let failedTests: string[] = []
  if (fs.existsSync(failedFile)) {
    failedTests = fs.readFileSync(failedFile, 'utf8').split('\n').filter(l => l.trim() !== '')
    fs.rmSync(failedFile, { force: true })
  }

  return {
    result: timedOut ? 'timeout' : proc.status === 0 ? 'green' : 'red',
    seconds,
    logPath: opts.logPath,
    failedTests,
  }
}
