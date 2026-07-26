import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { ExitCode } from '../types/enums.js'
import type { TerminalError } from '../types/errors.js'
import { createOutputContext } from './output/context.js'
import { resolveOutputMode } from './middleware/output-mode.js'
import { shutdown } from './shutdown.js'
import initCommand from './commands/init.js'
import runCommand from './commands/run.js'
import buildCommand from './commands/build.js'
import adoptCommand from './commands/adopt.js'
import skipCommand from './commands/skip.js'
import resetCommand from './commands/reset.js'
import statusCommand from './commands/status.js'
import nextCommand from './commands/next.js'
import validateCommand from './commands/validate.js'
import validateKnowledgeCommand from './commands/validate-knowledge.js'
import listCommand from './commands/list.js'
import infoCommand from './commands/info.js'
import versionCommand, { readPackageVersion } from './commands/version.js'
import updateCommand from './commands/update.js'
import dashboardCommand from './commands/dashboard.js'
import doctorCommand from './commands/doctor.js'
import decisionsCommand from './commands/decisions.js'
import knowledgeCommand from './commands/knowledge.js'
import skillCommand from './commands/skill.js'
import checkCommand from './commands/check.js'
import completeCommand from './commands/complete.js'
import reworkCommand from './commands/rework.js'
import observeCommand from './commands/observe.js'
import knowledgeFreshnessCommand from './commands/knowledge-freshness.js'
import guidesCommand from './commands/guides.js'
import agentOpsCommand from './commands/agent-ops.js'
import mqCommand from './commands/mq.js'
import tiaCommand from './commands/tia.js'
import schedCommand from './commands/sched.js'
import hooksCommand from './commands/hooks.js'

/**
 * Thrown by the `.fail()` handler purely to stop yargs from continuing.
 *
 * Verified against yargs 17: after `.fail()` returns normally, yargs still
 * invokes the command handler, which would emit a SECOND envelope on stdout
 * and make the output unparseable. Throwing halts it. `runCli` swallows this
 * sentinel because the failure has already been reported.
 */
class CliArgumentFailure extends Error {}

/**
 * Read the output-affecting flags straight from raw argv.
 *
 * On a parse failure yargs has not populated `parsed.argv`, so reading
 * `--format` from it silently yields undefined and the failure envelope falls
 * back to interactive mode — printing to stderr and leaving stdout empty for a
 * caller that explicitly asked for json. Same reason `commandName` is taken
 * from raw argv: `parsed.argv._` is empty at that point.
 */
function rawOutputHints(argv: string[]): { format?: string; auto?: boolean } {
  const i = argv.findIndex(a => a === '--format' || a.startsWith('--format='))
  let format: string | undefined
  if (i >= 0) {
    const token = argv[i] ?? ''
    format = token.includes('=') ? token.slice(token.indexOf('=') + 1) : argv[i + 1]
  }
  return { format, auto: argv.includes('--auto') }
}

export async function runCli(argv: string[]): Promise<void> {
  shutdown.install()
  const commandName = argv.find(a => !a.startsWith('-')) ?? ''
  try {
    await runYargs(argv, commandName, rawOutputHints(argv))
  } catch (err) {
    if (err instanceof CliArgumentFailure) return
    throw err
  }
}

async function runYargs(
  argv: string[],
  commandName: string,
  hints: { format?: string; auto?: boolean },
): Promise<void> {
  await yargs(argv)
    .scriptName('scaffold')
    .usage('$0 <command> [options]')
    .command(initCommand)
    .command(runCommand)
    .command(buildCommand)
    .command(adoptCommand)
    .command(skipCommand)
    .command(resetCommand)
    .command(statusCommand)
    .command(nextCommand)
    .command(validateCommand)
    .command(validateKnowledgeCommand)
    .command(listCommand)
    .command(infoCommand)
    .command(versionCommand)
    .command(updateCommand)
    .command(dashboardCommand)
    .command(doctorCommand)
    .command(guidesCommand)
    .command(decisionsCommand)
    .command(knowledgeCommand)
    .command(skillCommand)
    .command(checkCommand)
    .command(completeCommand)
    .command(reworkCommand)
    .command(observeCommand)
    .command(knowledgeFreshnessCommand)
    .command(agentOpsCommand)
    .command(mqCommand)
    .command(tiaCommand)
    .command(schedCommand)
    .command(hooksCommand)
    .options({
      format: {
        type: 'string',
        choices: ['json'] as const,
        description: 'Output format',
      },
      auto: {
        type: 'boolean',
        description: 'Suppress prompts, use safe defaults',
        default: false,
      },
      verbose: {
        type: 'boolean',
        description: 'Show verbose output',
        default: false,
      },
      root: {
        type: 'string',
        description: 'Project root directory (overrides auto-detection)',
      },
      force: {
        type: 'boolean',
        description: 'Override lock contention',
        default: false,
      },
    })
    .strict()
    .fail((msg, err, yargsInstance) => {
      // yargs routes two different things here, and conflating them is a trap.
      // Verified against yargs 17:
      //   msg set    -> parse error, strict-mode unknown arg, or a `.check()`
      //                 callback that threw (yargs copies its message into msg).
      //                 This repo runs applyFlagFamilyValidation inside
      //                 `.check()`, which throws a plain Error for ordinary
      //                 mistakes like mixing --web-rendering with
      //                 --backend-api-style. All of it is user input.
      //   msg null   -> a command handler threw. yargs also propagates that to
      //                 the caller, so rethrowing keeps the stack trace intact
      //                 rather than mislabelling a crash as bad input.
      // Note the discriminator is `msg`, not the presence of `err`: a `.check()`
      // throw sets BOTH, so keying on `err` would misroute every one of them.
      if (msg === null && err) throw err
      void yargsInstance
      const hint = commandName ? `scaffold ${commandName} --help` : 'scaffold --help'
      const scaffoldError: TerminalError = {
        code: 'CLI_ARGUMENT_ERROR',
        message: msg ?? (err ? err.message : 'Invalid arguments'),
        exitCode: ExitCode.ValidationError,
        recovery: `Run \`${hint}\` for available options`,
      }
      const mode = resolveOutputMode(hints)
      createOutputContext(mode).fail([scaffoldError])
      process.exitCode = ExitCode.ValidationError
      // Halt: yargs would otherwise run the command handler anyway.
      throw new CliArgumentFailure(scaffoldError.message)
    })
    .demandCommand(1, 'You must specify a command')
    .help()
    // `--version` is a documented global flag (PRD F-030 / CLI contract) and a
    // standard CLI convention. yargs handles it before demandCommand, so
    // `scaffold --version` prints the version and exits 0. The richer `scaffold
    // version` subcommand (latest-check, --format json) remains available.
    .version(readPackageVersion())
    .argv
}

export { hideBin }
