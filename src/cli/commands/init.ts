import type { CommandModule } from 'yargs'

interface InitArgs {
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

const initCommand: CommandModule<Record<string, unknown>, InitArgs> = {
  command: 'init',
  describe: 'Initialize scaffold for this project',
  builder: (yargs) => {
    return yargs
  },
  handler: async () => {
    console.log('scaffold init — not yet implemented')
    process.exitCode = 0
  },
}

export default initCommand
