import type { CommandModule } from 'yargs'

interface StatusArgs {
  phase?: number
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

const statusCommand: CommandModule<Record<string, unknown>, StatusArgs> = {
  command: 'status',
  describe: 'Show pipeline progress and step statuses',
  builder: (yargs) => {
    return yargs.option('phase', {
      type: 'number',
      description: 'Filter output to a specific phase number',
    })
  },
  handler: async () => {
    console.log('scaffold status — not yet implemented')
    process.exitCode = 0
  },
}

export default statusCommand
