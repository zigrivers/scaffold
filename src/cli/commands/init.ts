import type { CommandModule, Argv } from 'yargs'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { runWizard } from '../../wizard/wizard.js'

interface InitArgs {
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
  idea?: string
  methodology?: string
}

const initCommand: CommandModule<Record<string, unknown>, InitArgs> = {
  command: 'init',
  describe: 'Initialize scaffold for this project',
  builder: (yargs: Argv<Record<string, unknown>>) => {
    return yargs
      .option('root', { type: 'string', describe: 'Project root directory' })
      .option('force', { type: 'boolean', default: false, describe: 'Back up and reinitialize if .scaffold/ exists' })
      .option('auto', { type: 'boolean', default: false, describe: 'Non-interactive mode' })
      .option('methodology', { type: 'string', describe: 'Preset methodology (deep/mvp/custom)' })
      .option('idea', { type: 'string', describe: 'One-line project idea for methodology suggestion' })
      .option('format', { type: 'string', describe: 'Output format (json/auto/interactive)' })
      .option('verbose', { type: 'boolean', default: false, describe: 'Verbose output' }) as Argv<InitArgs>
  },
  handler: async (argv) => {
    const projectRoot = argv.root ?? process.cwd()
    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    const result = await runWizard({
      projectRoot,
      auto: argv.auto ?? false,
      force: argv.force ?? false,
      methodology: argv.methodology,
      idea: argv.idea,
      output,
    })

    if (!result.success) {
      for (const err of result.errors) {
        output.error(err)
      }
      process.exit(1)
      return
    }

    if (outputMode === 'json') {
      output.result(result)
    } else {
      output.success(`Scaffold initialized at ${result.configPath}`)
    }

    process.exit(0)
  },
}

export default initCommand
