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

/** Non-fatal warning (same shape as error but never causes non-zero exit). */
export interface ScaffoldWarning {
  /** Machine-readable warning code (e.g., 'CONFIG_UNKNOWN_FIELD'). */
  code: string
  /** Human-readable message. */
  message: string
  /** Context variables. */
  context?: Record<string, string | number | undefined>
}
