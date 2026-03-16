import type { CommandModule } from 'yargs'

interface BuildArgs {
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

const buildCommand: CommandModule<Record<string, unknown>, BuildArgs> = {
  command: 'build',
  describe: 'Generate platform adapter output files',
  builder: (yargs) => {
    return yargs
  },
  handler: async () => {
    console.log('scaffold build — not yet implemented')
    process.exitCode = 0
  },
}

export default buildCommand
