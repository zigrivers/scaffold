import type { Argv, CommandModule } from 'yargs'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { ExitCode } from '../../types/enums.js'
import { installHooks, type HooksInstallResult } from '../../core/hooks/install.js'

export interface HooksArgs {
  action: string
  root?: string
  format?: string
  auto?: boolean
  verbose?: boolean
}

export interface HooksOverrides {
  install?: (projectRoot: string) => HooksInstallResult
}

export async function hooksHandler(argv: HooksArgs, overrides: HooksOverrides = {}): Promise<void> {
  const output = createOutputContext(resolveOutputMode(argv))
  const projectRoot = argv.root ?? process.cwd()
  if (argv.action !== 'install') {
    output.fail([{
      code: 'HOOKS_UNKNOWN_ACTION',
      message: `unknown hooks action "${argv.action}"`,
      exitCode: ExitCode.ValidationError,
      recovery: 'The only supported action is `scaffold hooks install`',
    }])
    process.exitCode = ExitCode.ValidationError
    return
  }
  const install = overrides.install ?? installHooks
  let res: HooksInstallResult
  try {
    res = install(projectRoot)
  } catch (err) {
    output.fail([{
      code: 'HOOKS_INSTALL_FAILED',
      message: String(err instanceof Error ? err.message : err),
      exitCode: ExitCode.ValidationError,
      recovery: 'Check write permissions on .git/hooks/ and that this is a git repository',
    }])
    process.exitCode = ExitCode.ValidationError
    return
  }
  if (argv.format === 'json') {
    output.result(res)
    return
  }
  for (const line of res.added) output.info(`registered ${line}`)
  for (const line of res.alreadyPresent) output.info(`already registered ${line}`)
  for (const s of res.skipped) output.warn(s.reason)
  output.success(
    res.changed
      ? `hooks: settings updated — ${res.settingsPath}`
      : 'hooks: nothing to do — all registrations current',
  )
  // D8: Claude Code scope only in R2; AGENTS.md-based harnesses get the
  // printed --check wiring guidance (a --harness flag is deferred, spec §12).
  output.info(
    'Claude Code scope only. For AGENTS.md-based harnesses (Codex, Cursor, ...), ' +
      'wire the guards as pre-run checks instead:',
  )
  output.info('  scripts/bd-guard.sh --check "<command>"   # before destructive bd commands')
  output.info('  scripts/mq-guard.sh --check "<command>"   # before any gh pr merge')
}

const hooksCommand: CommandModule<Record<string, unknown>, HooksArgs> = {
  command: 'hooks <action>',
  describe: 'Register the Claude Code agent hooks (.claude/settings.json deep-merge, idempotent)',
  builder: (yargs: Argv) => {
    return yargs.positional('action', {
      describe: 'Action to perform',
      choices: ['install'] as const,
      type: 'string',
      demandOption: true,
    })
  },
  handler: async argv => hooksHandler(argv),
}

export default hooksCommand
