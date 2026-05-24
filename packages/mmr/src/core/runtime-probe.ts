import { spawn } from 'node:child_process'

export interface ProbeResult {
  detected: boolean
  reason?: string
}

const MAX_TIMEOUT_MS = 2_147_483_647
const MAX_ARG_LENGTH = 4096

/**
 * Probe for a local runtime by running `<command> <args>` with the given
 * timeout (ms). Returns detected=true if the process exits 0 within the
 * timeout. Used by `mmr config init` to detect ollama / lms / llama-server
 * / local-ai-delegate.
 *
 * The command name is validated against a strict character set before
 * spawn to prevent shell injection from a hardcoded probe list.
 */
export async function probeRuntime(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<ProbeResult> {
  if (!/^[a-zA-Z0-9._/-]+$/.test(command)) {
    return { detected: false, reason: 'invalid command name' }
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    return { detected: false, reason: 'invalid timeout' }
  }
  for (const arg of args) {
    if (arg.length > MAX_ARG_LENGTH || arg.includes('\0')) {
      return { detected: false, reason: 'invalid argument' }
    }
  }

  return new Promise<ProbeResult>((resolve) => {
    let settled = false
    const child = spawn(command, args, { stdio: 'ignore' })

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish({ detected: false, reason: 'timeout' })
    }, timeoutMs)

    function finish(result: ProbeResult): void {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    child.on('close', (code, signal) => {
      const reason = code === 0 ? undefined : signal ? `signal ${signal}` : `exit ${code}`
      finish({ detected: code === 0, reason })
    })
    child.on('error', (err) => {
      finish({ detected: false, reason: err.message })
    })
  })
}
