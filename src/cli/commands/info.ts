import type { CommandModule } from 'yargs'

interface InfoArgs {
  step: string
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

const infoCommand: CommandModule<Record<string, unknown>, InfoArgs> = {
  command: 'info <step>',
  describe: 'Show detailed info about a step',
  builder: (yargs) => {
    return yargs.positional('step', {
      type: 'string',
      description: 'Step name or ID to show info for',
      demandOption: true,
    })
  },
  handler: async () => {
    console.log('scaffold info — not yet implemented')
    process.exitCode = 0
  },
}

export default infoCommand
