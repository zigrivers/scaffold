import type { CommandModule } from 'yargs'

interface NextArgs {
  count?: number
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

const nextCommand: CommandModule<Record<string, unknown>, NextArgs> = {
  command: 'next',
  describe: 'Show next eligible step(s)',
  builder: (yargs) => {
    return yargs.option('count', {
      type: 'number',
      description: 'Number of next steps to show',
    })
  },
  handler: async () => {
    console.log('scaffold next — not yet implemented')
    process.exitCode = 0
  },
}

export default nextCommand
