import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export interface GateResult {
  result: 'green' | 'red' | 'timeout'
  seconds: number
  logPath: string
  /** Test ids from <cwd>/.mq-failed-tests.txt when the gate wrote it (contract); [] otherwise. */
  failedTests: string[]
}

const FAILED_TESTS_FILE = '.mq-failed-tests.txt'

export function runGate(opts: {
  cwd: string
  command: string
  timeoutMs: number
  logPath: string
  env?: Record<string, string>
  /** When set, the gate PGID is written here while running and removed when it
   *  settles, so a crashed daemon's orphaned gate can be reaped on next startup. */
  pidFile?: string
}): Promise<GateResult> {
  fs.mkdirSync(path.dirname(opts.logPath), { recursive: true })
  const started = Date.now()
  return new Promise(resolve => {
    // detached: the child leads its own process group so the timeout kill can
    // reach the whole tree (bash's children included), not just bash itself.
    const child = spawn('bash', ['-lc', opts.command], {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    if (opts.pidFile !== undefined && child.pid !== undefined) {
      try { fs.writeFileSync(opts.pidFile, String(child.pid)) } catch { /* best-effort */ }
    }
    const chunks: Buffer[] = []
    const MAX_LOG_BYTES = 64 * 1024 * 1024
    let captured = 0
    const capture = (c: Buffer) => {
      if (captured >= MAX_LOG_BYTES) return // cap: log is truncated, gate keeps running
      captured += c.length
      chunks.push(c)
    }
    child.stdout.on('data', capture)
    child.stdout.on('error', () => { /* stream error — close still decides the result */ })
    child.stderr.on('data', capture)
    child.stderr.on('error', () => { /* stream error — close still decides the result */ })
    let timedOut = false
    let settled = false
    const timer = setTimeout(() => {
      timedOut = true
      if (child.pid !== undefined) {
        try {
          process.kill(-child.pid, 'SIGKILL') // negative pid = whole group
        } catch { /* group already gone */ }
      }
    }, opts.timeoutMs)
    const finish = (result: GateResult['result']) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (opts.pidFile !== undefined) {
        try { fs.rmSync(opts.pidFile, { force: true }) } catch { /* best-effort */ }
      }
      fs.writeFileSync(opts.logPath, Buffer.concat(chunks))
      const failedFile = path.join(opts.cwd, FAILED_TESTS_FILE)
      let failedTests: string[] = []
      if (fs.existsSync(failedFile)) {
        failedTests = fs.readFileSync(failedFile, 'utf8')
          .split('\n').map(l => l.trim()).filter(l => l !== '')
        fs.rmSync(failedFile, { force: true })
      }
      resolve({
        result,
        seconds: Math.round((Date.now() - started) / 1000),
        logPath: opts.logPath,
        failedTests,
      })
    }
    child.on('close', code => finish(timedOut ? 'timeout' : code === 0 ? 'green' : 'red'))
    child.on('error', () => finish('red'))
  })
}
