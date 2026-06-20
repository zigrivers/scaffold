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
    .demandCommand(1, 'Run mmr --help for usage')
    .strict()
    .help()
    .argv
}
