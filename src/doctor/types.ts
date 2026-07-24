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
}

export interface DoctorCheck {
  id: string
  section: DoctorSection
  title: string
  run: (ctx: DoctorContext) => DoctorCheckResult
  /** R1 ships exactly one fix handler: the beads `bd doctor --fix` delegation (D5). */
  fix?: (ctx: DoctorContext) => { applied: boolean; detail: string }
}

export interface DoctorReport {
  results: DoctorCheckResult[]
  verdict: 'healthy' | 'warnings' | 'errors'
  exitCode: 0 | 1 | 2
}
