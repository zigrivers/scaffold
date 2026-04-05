import { spawn } from 'node:child_process'
import type { ChannelConfigParsed } from '../config/schema.js'

export interface AuthResult {
  status: 'ok' | 'failed' | 'timeout'
  recovery?: string
}

/**
 * Check whether a CLI command is installed (available on PATH).
 * Uses `command -v` via shell.
 */
export async function checkInstalled(command: string): Promise<boolean> {
  // Validate command name contains only safe characters
  if (!/^[a-zA-Z0-9._-]+$/.test(command)) return false
  return new Promise((resolve) => {
    // Use 'which' with argument array to avoid shell interpolation
    const child = spawn('which', [command], { stdio: 'ignore' })
    child.on('close', (code) => resolve(code === 0))
    child.on('error', () => resolve(false))
  })
}

/**
 * Run the auth check defined in a channel config.
 * Spawns `sh -c <auth.check>` with the channel's env merged into process.env.
 * Returns ok/failed/timeout based on exit code and timeout.
 */
export async function checkAuth(config: ChannelConfigParsed): Promise<AuthResult> {
  const { auth, env } = config

  return new Promise((resolve) => {
    let settled = false
    let timedOut = false

    const child = spawn('sh', ['-c', auth.check], {
      env: { ...process.env, ...env },
      stdio: 'ignore',
    })

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, auth.timeout * 1000)

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)

      if (timedOut) {
        resolve({ status: 'timeout' })
        return
      }

      if (code !== null && auth.failure_exit_codes.includes(code)) {
        resolve({ status: 'failed', recovery: auth.recovery })
        return
      }

      // Exit code 0 or any code not in failure_exit_codes -> ok (transient)
      resolve({ status: 'ok' })
    })

    child.on('error', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ status: 'failed', recovery: auth.recovery })
    })
  })
}
