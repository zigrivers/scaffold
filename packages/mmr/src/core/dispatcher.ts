import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { ChannelStatus } from '../types.js'
import type { JobStore } from './job-store.js'

export interface DispatchOptions {
  command: string
  prompt: string
  flags: string[]
  env: Record<string, string>
  timeout: number
  stderr: 'capture' | 'ignore'
}

const TERMINAL_STATUSES: ReadonlySet<ChannelStatus> = new Set([
  'completed',
  'timeout',
  'failed',
  'auth_failed',
  'skipped',
])

/** Check whether a channel status represents a terminal (done) state */
export function isChannelComplete(status: ChannelStatus): boolean {
  return TERMINAL_STATUSES.has(status)
}

/** Spawn a background process for a review channel and monitor it */
export async function dispatchChannel(
  store: JobStore,
  jobId: string,
  channelName: string,
  opts: DispatchOptions,
): Promise<void> {
  if (!/^[a-zA-Z0-9._-]+$/.test(channelName)) {
    throw new Error(`Unsafe channel name: ${channelName}`)
  }

  const jobDir = store.getJobDir(jobId)
  const channelsDir = path.join(jobDir, 'channels')

  // Split multi-word commands (e.g. "claude -p" → ["claude", "-p"])
  const [cmd, ...cmdArgs] = opts.command.split(/\s+/)
  const args = [...cmdArgs, ...opts.flags]

  // Update channel to running
  store.updateChannel(jobId, channelName, {
    status: 'running',
    started_at: new Date().toISOString(),
  })

  // Pipe prompt via stdin to avoid E2BIG on large diffs
  const proc = spawn(cmd, args, {
    detached: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...opts.env },
  })

  // Handle stdin pipe errors (child may close stdin early)
  proc.stdin.on('error', () => {
    // Swallow EPIPE — the close handler will deal with the process exit
  })

  // Write prompt to stdin
  proc.stdin.write(opts.prompt)
  proc.stdin.end()

  // Write PID file
  const pidFile = path.join(channelsDir, `${channelName}.pid`)
  fs.writeFileSync(pidFile, String(proc.pid))

  // Collect stdout and stderr
  let stdout = ''
  let stderr = ''

  proc.stdout.on('data', (chunk: Buffer) => {
    stdout += chunk.toString()
  })

  proc.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
  })

  // In-memory settled flag to prevent timeout/close race
  let settled = false

  // Set up timeout
  const timeoutMs = opts.timeout * 1000
  const timer = setTimeout(() => {
    if (settled) return
    settled = true
    try {
      // Kill the process group (negative PID kills the group)
      if (proc.pid) {
        process.kill(-proc.pid, 'SIGKILL')
      }
    } catch {
      // Process may have already exited
    }
    const completedAt = new Date().toISOString()
    store.updateChannel(jobId, channelName, {
      status: 'timeout',
      completed_at: completedAt,
    })
    if (stderr) {
      store.saveChannelLog(jobId, channelName, stderr)
    }
  }, timeoutMs)

  // Handle process close
  proc.on('close', (code: number | null) => {
    clearTimeout(timer)
    if (settled) return
    settled = true

    const completedAt = new Date().toISOString()

    if (code === 0 && stdout) {
      // Always save raw stdout — parser.ts handles format quirks
      store.saveChannelOutput(jobId, channelName, stdout)
      store.updateChannel(jobId, channelName, {
        status: 'completed',
        completed_at: completedAt,
      })
    } else {
      const errorMsg = stderr || `Process exited with code ${code}`
      store.saveChannelLog(jobId, channelName, errorMsg)
      store.updateChannel(jobId, channelName, {
        status: 'failed',
        completed_at: completedAt,
      })
    }
  })

  // Handle spawn errors
  proc.on('error', (err: Error) => {
    clearTimeout(timer)
    if (settled) return
    settled = true
    store.updateChannel(jobId, channelName, {
      status: 'failed',
      completed_at: new Date().toISOString(),
    })
    store.saveChannelLog(jobId, channelName, err.message)
  })

  // Unref so parent process can exit
  proc.unref()
}
