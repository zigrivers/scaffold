import type { CommandModule } from 'yargs'

interface ResetArgs {
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

const resetCommand: CommandModule<Record<string, unknown>, ResetArgs> = {
  command: 'reset',
  describe: 'Reset pipeline state (preserves config)',
  builder: (yargs) => {
    return yargs
  },
  handler: async () => {
    console.log('scaffold reset — not yet implemented')
    process.exitCode = 0
  },
}

export default resetCommand
