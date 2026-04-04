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
  const jobDir = store.getJobDir(jobId)
  const channelsDir = path.join(jobDir, 'channels')

  // Split multi-word commands (e.g. "claude -p" → ["claude", "-p"])
  const [cmd, ...cmdArgs] = opts.command.split(/\s+/)
  const args = [...cmdArgs, ...opts.flags, opts.prompt]

  // Update channel to running
  store.updateChannel(jobId, channelName, {
    status: 'running',
    started_at: new Date().toISOString(),
  })

  // Spawn the process detached so parent can exit
  const proc = spawn(cmd, args, {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...opts.env },
  })

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

  // Set up timeout
  const timeoutMs = opts.timeout * 1000
  const timer = setTimeout(() => {
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

    const completedAt = new Date().toISOString()
    const meta = store.loadJob(jobId)

    // If already marked as timeout, don't overwrite
    if (meta.channels[channelName]?.status === 'timeout') {
      return
    }

    if (code === 0 && stdout) {
      try {
        const parsed = JSON.parse(stdout)
        store.saveChannelOutput(jobId, channelName, parsed)
      } catch {
        // Not valid JSON; save as raw log
        store.saveChannelLog(jobId, channelName, stdout)
      }
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
    store.updateChannel(jobId, channelName, {
      status: 'failed',
      completed_at: new Date().toISOString(),
    })
    store.saveChannelLog(jobId, channelName, err.message)
  })

  // Unref so parent process can exit
  proc.unref()
}
