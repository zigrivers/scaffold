import type { CommandModule } from 'yargs'

interface AdoptArgs {
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

const adoptCommand: CommandModule<Record<string, unknown>, AdoptArgs> = {
  command: 'adopt',
  describe: 'Adopt an existing project into scaffold',
  builder: (yargs) => {
    return yargs
  },
  handler: async () => {
    console.log('scaffold adopt — not yet implemented')
    process.exitCode = 0
  },
}

export default adoptCommand
