import type { CommandModule } from 'yargs'

interface SkipArgs {
  step: string
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

const skipCommand: CommandModule<Record<string, unknown>, SkipArgs> = {
  command: 'skip <step>',
  describe: 'Skip a pipeline step',
  builder: (yargs) => {
    return yargs.positional('step', {
      type: 'string',
      description: 'Step name or ID to skip',
      demandOption: true,
    })
  },
  handler: async () => {
    console.log('scaffold skip — not yet implemented')
    process.exitCode = 0
  },
}

export default skipCommand
