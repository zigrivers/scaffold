import type { CommandModule } from 'yargs'

interface DashboardArgs {
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

const dashboardCommand: CommandModule<Record<string, unknown>, DashboardArgs> = {
  command: 'dashboard',
  describe: 'Open pipeline dashboard in browser',
  builder: (yargs) => {
    return yargs
  },
  handler: async () => {
    console.log('scaffold dashboard — not yet implemented')
    process.exitCode = 0
  },
}

export default dashboardCommand
