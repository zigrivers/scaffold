import type { CommandModule } from 'yargs'

interface ValidateArgs {
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

const validateCommand: CommandModule<Record<string, unknown>, ValidateArgs> = {
  command: 'validate',
  describe: 'Validate meta-prompts and config',
  builder: (yargs) => {
    return yargs
  },
  handler: async () => {
    console.log('scaffold validate — not yet implemented')
    process.exitCode = 0
  },
}

export default validateCommand
