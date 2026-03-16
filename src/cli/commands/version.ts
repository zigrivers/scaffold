import type { CommandModule } from 'yargs'

interface VersionArgs {
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

const versionCommand: CommandModule<Record<string, unknown>, VersionArgs> = {
  command: 'version',
  describe: 'Show scaffold version and check for updates',
  builder: (yargs) => {
    return yargs
  },
  handler: async () => {
    console.log('scaffold version — not yet implemented')
    process.exitCode = 0
  },
}

export default versionCommand
