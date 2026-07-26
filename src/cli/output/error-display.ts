import type { ScaffoldError, ScaffoldWarning } from '../../types/index.js'
import type { OutputContext } from './context.js'
import type { TerminalError } from '../../types/errors.js'
import { ExitCode } from '../../types/enums.js'
import { withRecovery } from '../../utils/errors.js'
import { findClosestMatch } from '../../utils/levenshtein.js'

/**
 * Format a single ScaffoldError as a multi-line string.
 * Format: "✗ error [CODE]: message\n  File: <file>\n  Line: <line>\n  Fix: <recovery>"
 */
export function formatError(error: ScaffoldError): string {
  const lines: string[] = [`✗ error [${error.code}]: ${error.message}`]

  if (error.context?.file !== undefined) {
    lines.push(`  File: ${error.context.file}`)
  }

  if (error.context?.line !== undefined) {
    lines.push(`  Line: ${error.context.line}`)
  }

  if (error.recovery !== undefined) {
    lines.push(`  Fix: ${error.recovery}`)
  }

  return lines.join('\n')
}

/**
 * Format a single ScaffoldWarning as a single-line string.
 * Format: "⚠ warning [CODE]: message"
 */
export function formatWarning(warning: ScaffoldWarning): string {
  return `⚠ warning [${warning.code}]: ${warning.message}`
}

/**
 * Format a batch of errors and warnings.
 * Errors appear before warnings.
 * Returns an array of formatted strings (one per error/warning).
 */
export function formatBatch(errors: ScaffoldError[], warnings: ScaffoldWarning[]): string[] {
  return [
    ...errors.map(formatError),
    ...warnings.map(formatWarning),
  ]
}

/**
 * Format an error with a fuzzy match suggestion appended to the message line.
 * If error.context.value is a string and a close match is found among candidates,
 * appends " Did you mean '<closest>'?" to the first line.
 */
export function formatErrorWithSuggestion(error: ScaffoldError, candidates: string[]): string {
  const value = error.context?.value

  if (typeof value !== 'string' || value === '' || candidates.length === 0) {
    return formatError(error)
  }

  const match = findClosestMatch(value, candidates, 2)

  if (match === null) {
    return formatError(error)
  }

  // Build modified error with suggestion appended to message
  const lines: string[] = [
    `✗ error [${error.code}]: ${error.message} Did you mean '${match}'?`,
  ]

  if (error.context?.file !== undefined) {
    lines.push(`  File: ${error.context.file}`)
  }

  if (error.context?.line !== undefined) {
    lines.push(`  Line: ${error.context.line}`)
  }

  if (error.recovery !== undefined) {
    lines.push(`  Fix: ${error.recovery}`)
  }

  return lines.join('\n')
}

/**
 * Display a batch of errors and warnings using an OutputContext.
 * Calls output.error() for each error and output.warn() for each warning.
 * The OutputContext implementations handle their own formatting.
 */
export function displayErrors(
  errors: ScaffoldError[],
  warnings: ScaffoldWarning[],
  output: OutputContext,
): void {
  for (const error of errors) {
    output.error(error)
  }

  for (const warning of warnings) {
    output.warn(warning)
  }
}

/**
 * Terminal variant of {@link displayErrors}: renders the warnings for humans
 * and emits the failure envelope carrying every error.
 *
 * `displayErrors` routes through the stderr-only `output.error()`, so a
 * command that called it and then exited non-zero produced empty stdout under
 * `--format json` — the same defect the envelope sweep removed from the
 * `output.error(` call sites, surviving one indirection deeper. Six terminal
 * sites across `run`, `build`, and `rework` were still doing that after the
 * sweep claimed CLI-wide coverage.
 *
 * Sets `process.exitCode` and returns rather than exiting, so a buffered
 * stdout write is never truncated.
 */
export function failWithErrors(
  errors: ScaffoldError[],
  warnings: ScaffoldWarning[],
  output: OutputContext,
  fallbackRecovery: string,
  exitCode: ExitCode = ExitCode.ValidationError,
): void {
  for (const warning of warnings) {
    output.warn(warning)
  }
  // No synthetic fallback for an empty errors array: OutputContext.fail()
  // already guarantees at least one entry, and fabricating one here would
  // mask a caller that passed nothing by mistake behind a plausible-looking
  // error.
  const reported: TerminalError[] = errors.map(e => withRecovery(e, fallbackRecovery))
  output.fail(reported, exitCode)
  process.exitCode = exitCode
}
