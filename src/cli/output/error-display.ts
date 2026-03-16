import type { ScaffoldError, ScaffoldWarning } from '../../types/index.js'
import type { OutputContext } from './context.js'
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
