import type { OutputMode } from '../../types/enums.js'

/** Real process TTY state, injectable so the resolution logic stays testable. */
export interface TtyState {
  stdin: boolean
  stdout: boolean
}

function realTty(): TtyState {
  return {
    stdin: process.stdin.isTTY === true,
    stdout: process.stdout.isTTY === true,
  }
}

/**
 * Resolve the output mode from parsed argv flags and environment.
 *
 * Priority:
 * 1. --format json  -> 'json'
 * 2. --auto         -> 'auto'
 * 3. Not a TTY      -> 'auto'   (an environment that cannot answer a prompt is
 *                                non-interactive whether or not the caller
 *                                remembered --auto)
 * 4. Default        -> 'interactive'
 *
 * Rule 3 is the fix for the trap where `scaffold init --project-type web-app`
 * piped from /dev/null silently answered every question with the first option
 * while `--auto` on the same input refused. The safer-looking flag was the
 * strict one.
 */
export function resolveOutputMode(
  argv: { format?: string; auto?: boolean },
  tty: TtyState = realTty(),
): OutputMode {
  if (argv.format === 'json') return 'json'
  if (argv.auto === true) return 'auto'
  if (!tty.stdin || !tty.stdout) return 'auto'
  return 'interactive'
}

/**
 * Yargs middleware that resolves output mode and normalizes `auto`.
 *
 * Sets `argv.outputMode`, and sets `argv.auto` for any non-interactive mode.
 *
 * The second part is load-bearing and easy to omit. Commands read `argv.auto`
 * to decide whether a question may be defaulted; the wizard's discriminator
 * checks are gated on it. Setting only `outputMode` would change how answers
 * are PRINTED without changing whether they may be invented, so a piped run
 * would keep writing a config nobody chose while appearing to be fixed.
 *
 * Usage: .middleware(createOutputModeMiddleware())
 */
export function createOutputModeMiddleware(
  tty: TtyState = realTty(),
): (argv: Record<string, unknown>) => void {
  return (argv: Record<string, unknown>) => {
    const mode = resolveOutputMode(argv as { format?: string; auto?: boolean }, tty)
    argv['outputMode'] = mode
    if (mode !== 'interactive') argv['auto'] = true
  }
}
