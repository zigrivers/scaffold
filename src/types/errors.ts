import type { ExitCode } from './enums.js'

/** Structured error with code, exit code, and recovery hint. */
export interface ScaffoldError {
  /** Machine-readable error code (e.g., 'CONFIG_MISSING'). */
  code: string
  /** Human-readable message. */
  message: string
  /** Process exit code. */
  exitCode: ExitCode
  /** Suggested fix. */
  recovery?: string
  /** Context variables (file, line, value, etc.). */
  context?: Record<string, string | number | undefined>
}

/**
 * A ScaffoldError at a process-ending site, where `recovery` is mandatory.
 *
 * `ScaffoldError.recovery` stays optional because plenty of non-terminal
 * `warn`/`error` callers legitimately have nothing actionable to add. But the
 * last thing a caller sees before a non-zero exit must tell them what to do
 * next, so terminal sites narrow to this type: a site that forgets becomes a
 * compile error rather than a documentation promise that quietly rots.
 */
export type TerminalError = ScaffoldError & { recovery: string }

/** Non-fatal warning (same shape as error but never causes non-zero exit). */
export interface ScaffoldWarning {
  /** Machine-readable warning code (e.g., 'CONFIG_UNKNOWN_FIELD'). */
  code: string
  /** Human-readable message. */
  message: string
  /** Context variables. */
  context?: Record<string, string | number | undefined>
}
