import type { CommandModule } from 'yargs'
import auditPrefilterCommand from './knowledge-freshness-audit-prefilter.js'
import auditRunEntryCommand from './knowledge-freshness-audit-run-entry.js'
import auditApplyCommand from './knowledge-freshness-audit-apply.js'
import linkCheckCommand from './knowledge-freshness-link-check.js'
import lintUnsourcedCommand from './knowledge-freshness-lint-unsourced.js'
import antiOverRewriteCommand from './knowledge-freshness-anti-over-rewrite.js'
import deepGuidanceCheckCommand from './knowledge-freshness-deep-guidance-check.js'

const knowledgeFreshnessCommand: CommandModule = {
  command: 'knowledge-freshness <command>',
  describe: 'Knowledge-base freshness audit commands',
  builder: (y) =>
    y
      .command(auditPrefilterCommand)
      .command(auditRunEntryCommand)
      .command(auditApplyCommand)
      .command(linkCheckCommand)
      .command(lintUnsourcedCommand)
      .command(antiOverRewriteCommand)
      .command(deepGuidanceCheckCommand)
      .demandCommand(1, 'Specify a knowledge-freshness subcommand'),
  handler: () => { /* yargs routes to the chosen subcommand */ },
}

export default knowledgeFreshnessCommand
