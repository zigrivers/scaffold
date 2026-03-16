import type { CommandModule } from 'yargs'

interface UpdateArgs {
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

const updateCommand: CommandModule<Record<string, unknown>, UpdateArgs> = {
  command: 'update',
  describe: 'Update scaffold to the latest version',
  builder: (yargs) => {
    return yargs
  },
  handler: async () => {
    console.log('scaffold update — not yet implemented')
    process.exitCode = 0
  },
}

export default updateCommand
