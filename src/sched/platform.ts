import os from 'node:os'
import { realExec } from './exec.js'
import { createLaunchdBackend } from './backends/launchd.js'
import { createSystemdBackend } from './backends/systemd.js'
import type { SchedBackend } from './types.js'

/**
 * os.userInfo() throws (getpwuid ENOENT) in minimal Linux/Docker images where
 * the running UID has no /etc/passwd entry. Fall back to the environment, then
 * to the numeric UID, so scheduling still works in those environments.
 */
function resolveUsername(): string {
  try {
    return os.userInfo().username
  } catch {
    return process.env.USER
      ?? process.env.USERNAME
      ?? (typeof process.getuid === 'function' ? String(process.getuid()) : 'unknown')
  }
}

/** Shared by `scaffold sched` and `scaffold mq bootstrap` (D9 arm step). */
export function pickSchedBackend(): SchedBackend {
  if (process.platform === 'darwin') {
    return createLaunchdBackend({
      exec: realExec,
      home: os.homedir(),
      uid: typeof process.getuid === 'function' ? process.getuid() : 0,
    })
  }
  if (process.platform === 'linux') {
    return createSystemdBackend({ exec: realExec, home: os.homedir(), user: resolveUsername() })
  }
  throw new Error(
    `scaffold sched: unsupported platform "${process.platform}" (launchd on macOS, systemd on Linux)`,
  )
}
