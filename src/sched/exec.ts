import { execFileSync } from 'node:child_process'

export interface ExecResult {
  status: number
  stdout: string
  stderr: string
}

/** Injectable exec seam (same DI posture as the merge-queue daemon's deps):
 *  backends never call child_process directly, so tests fake launchctl/systemctl. */
export type Exec = (cmd: string, args: string[]) => ExecResult

export const realExec: Exec = (cmd, args) => {
  try {
    const stdout = execFileSync(cmd, args, { encoding: 'utf8', timeout: 60_000 })
    return { status: 0, stdout, stderr: '' }
  } catch (err) {
    const e = err as { status?: number | null; stdout?: unknown; stderr?: unknown }
    return {
      status: typeof e.status === 'number' ? e.status : 1,
      stdout: String(e.stdout ?? ''),
      stderr: String(e.stderr ?? ''),
    }
  }
}
