import type { CommandModule, ArgumentsCamelCase } from 'yargs'
import { COMMAND_MANIFEST } from '../core/manifest.js'

interface CommandsArgs {
  format?: string
}

export const commandsCommand: CommandModule<object, CommandsArgs> = {
  command: 'commands',
  describe: 'List MMR commands as a machine-readable capability manifest',
  builder: (yargs) =>
    yargs
      .option('format', {
        choices: ['text', 'json'],
        default: 'text',
        describe: 'Output format (json = the full capability manifest for agents)',
      })
      .example('mmr commands', 'Human-readable command list')
      .example('mmr commands --format json', 'Machine-readable manifest for agents'),
  handler: (args: ArgumentsCamelCase<CommandsArgs>) => {
    if (args.format === 'json') {
      console.log(JSON.stringify(COMMAND_MANIFEST, null, 2))
      return
    }
    const width = Math.max(...COMMAND_MANIFEST.map((s) => s.command.length))
    for (const s of COMMAND_MANIFEST) {
      console.log(`  ${s.command.padEnd(width)}  ${s.summary}`)
    }
  },
}
