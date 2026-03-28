import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import initCommand from './commands/init.js'
import runCommand from './commands/run.js'
import buildCommand from './commands/build.js'
import adoptCommand from './commands/adopt.js'
import skipCommand from './commands/skip.js'
import resetCommand from './commands/reset.js'
import statusCommand from './commands/status.js'
import nextCommand from './commands/next.js'
import validateCommand from './commands/validate.js'
import listCommand from './commands/list.js'
import infoCommand from './commands/info.js'
import versionCommand from './commands/version.js'
import updateCommand from './commands/update.js'
import dashboardCommand from './commands/dashboard.js'
import decisionsCommand from './commands/decisions.js'
import knowledgeCommand from './commands/knowledge.js'
import skillCommand from './commands/skill.js'
import checkCommand from './commands/check.js'
import completeCommand from './commands/complete.js'
import reworkCommand from './commands/rework.js'

export async function runCli(argv: string[]): Promise<void> {
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
    .command(listCommand)
    .command(infoCommand)
    .command(versionCommand)
    .command(updateCommand)
    .command(dashboardCommand)
    .command(decisionsCommand)
    .command(knowledgeCommand)
    .command(skillCommand)
    .command(checkCommand)
    .command(completeCommand)
    .command(reworkCommand)
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
    .demandCommand(1, 'You must specify a command')
    .help()
    .version(false)
    .argv
}

export { hideBin }
