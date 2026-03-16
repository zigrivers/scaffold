import type { CommandModule } from 'yargs'

interface DecisionsArgs {
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

const decisionsCommand: CommandModule<Record<string, unknown>, DecisionsArgs> = {
  command: 'decisions',
  describe: 'Show recorded decisions',
  builder: (yargs) => {
    return yargs
  },
  handler: async () => {
    console.log('scaffold decisions — not yet implemented')
    process.exitCode = 0
  },
}

export default decisionsCommand
