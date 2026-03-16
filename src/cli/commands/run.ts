import type { Argv, CommandModule } from 'yargs'

interface RunArgs {
  step: string
  depth?: number
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

const runCommand: CommandModule<Record<string, unknown>, RunArgs> = {
  command: 'run <step>',
  describe: 'Run a pipeline step',
  builder: (yargs: Argv<Record<string, unknown>>): Argv<RunArgs> => {
    return yargs
      .positional('step', {
        type: 'string',
        description: 'Step name or ID to run',
        demandOption: true,
      })
      .option('depth', {
        type: 'number',
        description: 'Override methodology depth for this run',
      }) as unknown as Argv<RunArgs>
  },
  handler: async () => {
    console.log('scaffold run — not yet implemented')
    process.exitCode = 0
  },
}

export default runCommand
