import yargs from 'yargs'
import { reviewCommand } from './commands/review.js'
import { statusCommand } from './commands/status.js'
import { resultsCommand } from './commands/results.js'
import { configCommand } from './commands/config.js'
import { doctorCommand } from './commands/doctor.js'
import { jobsCommand } from './commands/jobs.js'
import { reconcileCommand } from './commands/reconcile.js'
import { sessionsCommand } from './commands/sessions.js'
import { ackCommand } from './commands/ack.js'
import { skillCommand } from './commands/skill.js'
import { commandsCommand } from './commands/commands.js'
import { explainCommand } from './commands/explain.js'

/**
 * Top-level command names registered below. Exported so the manifest-drift test
 * can assert every command appears in COMMAND_MANIFEST (no silent gaps).
 */
export const REGISTERED_TOP_LEVEL = [
  'review', 'status', 'results', 'config', 'doctor', 'jobs',
  'reconcile', 'sessions', 'ack', 'skill', 'commands', 'explain',
] as const

export async function runCli(argv: string[]): Promise<void> {
  await yargs(argv)
    .scriptName('mmr')
    .usage('$0 <command> [options]')
    .command(reviewCommand)
    .command(statusCommand)
    .command(resultsCommand)
    .command(configCommand)
    .command(doctorCommand)
    .command(jobsCommand)
    .command(reconcileCommand)
    .command(sessionsCommand)
    .command(ackCommand)
    .command(skillCommand)
    .command(commandsCommand)
    .command(explainCommand)
    .demandCommand(1, 'Run mmr --help for usage')
    .strict()
    .help()
    .argv
}
