export type DoctorSection = 'pipeline' | 'beads' | 'hooks' | 'gate' | 'queue' | 'scheduler'
export type DoctorStatus = 'ok' | 'warn' | 'error' | 'skip'

export interface DoctorCheckResult {
  id: string
  section: DoctorSection
  title: string
  status: DoctorStatus
  detail: string
  remediation?: string
}

export interface DoctorContext {
  projectRoot: string
  runCmd: (cmd: string, timeoutS?: number) => { status: number | null; stdout: string; stderr: string }
  /**
   * Argv-based runner — spawns `bin` with `args` WITHOUT a shell. Use this
   * instead of `runCmd` whenever any part of the command is derived from
   * untrusted/filesystem-sourced data (e.g. a launchd label or systemd unit
   * name read from a directory listing): passing it as a literal argv
   * element rather than interpolating into a shell string means shell
   * metacharacters in the value can never be executed.
   */
  runArgv: (bin: string, args: string[], timeoutS?: number) => { status: number | null; stdout: string; stderr: string }
}

export interface DoctorCheck {
  id: string
  section: DoctorSection
  title: string
  run: (ctx: DoctorContext) => DoctorCheckResult
  /** Optional safe-fix handler (D5): beads `bd doctor --fix` delegation (R1), plus
   *  hook re-registration and scheduler reload (R2) — both thin wrappers over their
   *  D8/D6 primitives. */
  fix?: (ctx: DoctorContext) => { applied: boolean; detail: string }
}

export interface DoctorReport {
  results: DoctorCheckResult[]
  verdict: 'healthy' | 'warnings' | 'errors'
  exitCode: 0 | 1 | 2
}
