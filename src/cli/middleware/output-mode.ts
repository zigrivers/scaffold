import type { OutputMode } from '../../types/enums.js'

/**
 * Resolve the output mode from parsed argv flags and environment.
 *
 * Priority:
 * 1. --format json → 'json'
 * 2. --auto → 'auto'
 * 3. Default → 'interactive'
 */
export function resolveOutputMode(argv: {
  format?: string
  auto?: boolean
}): OutputMode {
  if (argv.format === 'json') return 'json'
  if (argv.auto === true) return 'auto'
  return 'interactive'
}

/**
 * Yargs middleware that resolves output mode and sets it on argv.
 * Sets argv.outputMode to the resolved OutputMode.
 *
 * Usage: .middleware(createOutputModeMiddleware())
 */
export function createOutputModeMiddleware(): (argv: Record<string, unknown>) => void {
  return (argv: Record<string, unknown>) => {
    argv['outputMode'] = resolveOutputMode(argv as { format?: string; auto?: boolean })
  }
}
