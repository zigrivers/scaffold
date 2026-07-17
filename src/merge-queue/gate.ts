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
    const chunks: Buffer[] = []
    child.stdout.on('data', c => chunks.push(c as Buffer))
    child.stderr.on('data', c => chunks.push(c as Buffer))
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      if (child.pid !== undefined) {
        try {
          process.kill(-child.pid, 'SIGKILL') // negative pid = whole group
        } catch { /* group already gone */ }
      }
    }, opts.timeoutMs)
    const finish = (result: GateResult['result']) => {
      clearTimeout(timer)
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
