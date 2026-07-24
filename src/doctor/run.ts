import { spawnSync } from 'node:child_process'
import { DOCTOR_CHECKS } from './checks.js'
import type { DoctorCheck, DoctorCheckResult, DoctorContext, DoctorReport } from './types.js'

/** Bounded shell runner. Every failure mode (non-zero, ENOENT, timeout) is status null/non-zero — never a throw. */
export function makeRunCmd(projectRoot: string, env?: NodeJS.ProcessEnv): DoctorContext['runCmd'] {
  return (cmd, timeoutS = 10) => {
    try {
      const res = spawnSync(cmd, {
        shell: true,
        cwd: projectRoot,
        timeout: timeoutS * 1000,
        encoding: 'utf8',
        env: env ?? process.env,
      })
      return { status: res.error !== undefined ? null : res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' }
    } catch {
      return { status: null, stdout: '', stderr: '' }
    }
  }
}

/**
 * Bounded argv runner — no shell. `bin` is still resolved via PATH (Node's
 * spawnSync does its own PATH lookup when `shell` is unset), but `args` are
 * passed as literal argv elements and never interpreted by a shell. Same
 * failure-mode contract as `makeRunCmd`.
 */
export function makeRunArgv(projectRoot: string, env?: NodeJS.ProcessEnv): DoctorContext['runArgv'] {
  return (bin, args, timeoutS = 10) => {
    try {
      const res = spawnSync(bin, args, {
        cwd: projectRoot,
        timeout: timeoutS * 1000,
        encoding: 'utf8',
        env: env ?? process.env,
      })
      return { status: res.error !== undefined ? null : res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' }
    } catch {
      return { status: null, stdout: '', stderr: '' }
    }
  }
}

export function runDoctor(
  projectRoot: string,
  options?: {
    fix?: boolean
    checks?: DoctorCheck[]
    runCmd?: DoctorContext['runCmd']
    runArgv?: DoctorContext['runArgv']
  },
): DoctorReport {
  const ctx: DoctorContext = {
    projectRoot,
    runCmd: options?.runCmd ?? makeRunCmd(projectRoot),
    runArgv: options?.runArgv ?? makeRunArgv(projectRoot),
  }
  const safeRun = (check: DoctorCheck): DoctorCheckResult => {
    try {
      return check.run(ctx)
    } catch (err) {
      return {
        id: check.id, section: check.section, title: check.title,
        status: 'error', detail: `check crashed: ${(err as Error).message}`,
      }
    }
  }
  const results: DoctorCheckResult[] = []
  for (const check of options?.checks ?? DOCTOR_CHECKS) {
    let result = safeRun(check)
    if (options?.fix === true && check.fix !== undefined
        && (result.status === 'warn' || result.status === 'error')) {
      const fixOutcome = check.fix(ctx)
      if (fixOutcome.applied) {
        result = safeRun(check)
        result = { ...result, detail: `${result.detail} (after fix: ${fixOutcome.detail})` }
      } else {
        result = { ...result, detail: `${result.detail} (fix not applied: ${fixOutcome.detail})` }
      }
    }
    results.push(result)
  }
  const hasError = results.some((r) => r.status === 'error')
  const hasWarn = results.some((r) => r.status === 'warn')
  return {
    results,
    verdict: hasError ? 'errors' : hasWarn ? 'warnings' : 'healthy',
    exitCode: hasError ? 2 : hasWarn ? 1 : 0,
  }
}
