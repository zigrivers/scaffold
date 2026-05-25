import type { CommandModule } from 'yargs'
import auditPrefilterCommand from './knowledge-freshness-audit-prefilter.js'
// Task 7 adds:  import auditRunEntryCommand from './knowledge-freshness-audit-run-entry.js'
// Task 8 adds:  import auditApplyCommand     from './knowledge-freshness-audit-apply.js'

const knowledgeFreshnessCommand: CommandModule = {
  command: 'knowledge-freshness <command>',
  describe: 'Knowledge-base freshness audit commands',
  builder: (y) =>
    y
      .command(auditPrefilterCommand)
      // Tasks 7 and 8 chain their .command(...) calls here as they land.
      .demandCommand(1, 'Specify a knowledge-freshness subcommand'),
  handler: () => { /* yargs routes to the chosen subcommand */ },
}

export default knowledgeFreshnessCommand
