import { spawn } from 'node:child_process'
import type { ChannelConfigParsed, HttpChannelParsed, SubprocessChannelParsed } from '../config/schema.js'
import { deriveProbeUrl } from '../config/schema.js'
import { withNeutralPosture } from './host-isolation.js'

// Re-exported so callers (and tests) can derive an http probe URL from auth.ts.
export { deriveProbeUrl }

type AuthenticatedChannelConfig = SubprocessChannelParsed & {
  auth: NonNullable<SubprocessChannelParsed['auth']>
}

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
    // Use POSIX-portable 'command -v' via shell (command name already validated above)
    const child = spawn('sh', ['-c', 'command -v "$1"', '--', command], { stdio: 'ignore' })
    child.on('close', (code) => resolve(code === 0))
    child.on('error', () => resolve(false))
  })
}

/**
 * Single-attempt auth check. Spawns `sh -c <auth.check>` with the channel's
 * env merged into process.env. Returns ok/failed/timeout based on exit code
 * and timeout.
 */
async function runAuthCheck(config: AuthenticatedChannelConfig): Promise<AuthResult> {
  const { auth, env } = config
  const posture = withNeutralPosture(env, config.cwd)
  try {
    return await new Promise<AuthResult>((resolve) => {
      let settled = false
      let timedOut = false

      const child = spawn('sh', ['-c', auth.check], {
        env: { ...process.env, ...posture.env },
        cwd: posture.cwd,
        stdio: 'ignore',
        detached: true,
      })

      const timer = setTimeout(() => {
        timedOut = true
        try {
          if (child.pid) {
            process.kill(-child.pid, 'SIGKILL')
          }
        } catch {
          // ignore
        }
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
  } finally {
    posture.cleanup()
  }
}

/**
 * Run the auth check defined in a channel config, retrying once on timeout
 * to handle transient network issues.
 */
export async function checkAuth(config: ChannelConfigParsed): Promise<AuthResult> {
  // Polymorphic over channel kind: HTTP channels are auth-probed over the wire.
  if (config.kind === 'http') {
    return checkHttpAuth(config)
  }
  if (!config.auth) {
    return { status: 'ok' }
  }
  const authConfig = { ...config, auth: config.auth }
  const result = await runAuthCheck(authConfig)
  if (result.status === 'timeout') {
    // Retry once on timeout (transient network issue)
    return runAuthCheck(authConfig)
  }
  return result
}

/**
 * Auth-probe an HTTP (openai-chat) channel: GET the configured (or derived)
 * probe URL with the channel's full request context and map the status to
 * ok/failed/timeout. The API key value is read only to build the request
 * header — it is NEVER logged or returned in the result.
 */
export async function checkHttpAuth(channel: HttpChannelParsed): Promise<AuthResult> {
  const probeUrl = channel.auth.check_endpoint ?? deriveProbeUrl(channel.endpoint)
  if (!probeUrl) {
    return { status: 'failed', recovery: channel.auth.recovery }
  }
  const headers: Record<string, string> = { ...(channel.headers ?? {}) }
  if (channel.api_key_env) {
    const value = process.env[channel.api_key_env]
    if (!value) {
      return { status: 'failed', recovery: channel.auth.recovery }
    }
    // Drop any case-variant of the target header so the api-key header wins.
    const target = channel.api_key_header.toLowerCase()
    for (const k of Object.keys(headers)) {
      if (k.toLowerCase() === target) delete headers[k]
    }
    headers[channel.api_key_header] = `${channel.api_key_prefix}${value}`
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), channel.auth.timeout * 1000)
  try {
    const res = await fetch(probeUrl, {
      method: channel.auth.check_method,
      headers,
      signal: controller.signal,
    })
    if (channel.auth.check_status_ok.includes(res.status)) {
      return { status: 'ok' }
    }
    // A non-ok HTTP response is plausibly an auth problem (401/403/…) → surface
    // the user's auth-setup recovery guidance.
    return { status: 'failed', recovery: channel.auth.recovery }
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'AbortError') {
      return { status: 'timeout' }
    }
    // Transport-level failure (DNS, connection refused, TLS) is NOT an auth
    // problem — do not attach auth recovery text, which would mislead.
    return { status: 'failed' }
  } finally {
    clearTimeout(timer)
  }
}
