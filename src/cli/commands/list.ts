import type { CommandModule } from 'yargs'

interface ListArgs {
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

const listCommand: CommandModule<Record<string, unknown>, ListArgs> = {
  command: 'list',
  describe: 'List all pipeline steps with status',
  builder: (yargs) => {
    return yargs
  },
  handler: async () => {
    console.log('scaffold list — not yet implemented')
    process.exitCode = 0
  },
}

export default listCommand
