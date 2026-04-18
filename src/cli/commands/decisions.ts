import type { CommandModule } from 'yargs'
import { readDecisions } from '../../state/decision-logger.js'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { guardSteplessCommand } from '../guards.js'
import { StatePathResolver } from '../../state/state-path-resolver.js'
import { ensureV3Migration } from '../../state/ensure-v3-migration.js'
import { loadConfig } from '../../config/loader.js'

interface DecisionsArgs {
  step?: string
  last?: number
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
  service?: string
}

const decisionsCommand: CommandModule<Record<string, unknown>, DecisionsArgs> = {
  command: 'decisions',
  describe: 'Show recorded decisions',
  builder: (yargs) => {
    return yargs
      .option('step', {
        type: 'string',
        description: 'Filter decisions by step slug',
      })
      .option('last', {
        type: 'number',
        description: 'Show last N decisions',
      })
      .option('service', {
        type: 'string',
        describe: 'Target service name (multi-service projects)',
      })
  },
  handler: async (argv) => {
    const projectRoot = argv.root ?? findProjectRoot(process.cwd())
    if (!projectRoot) {
      process.exit(1)
    }

    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    const service = argv.service as string | undefined
    if (service) {
      const { config } = loadConfig(projectRoot, [])
      guardSteplessCommand(config ?? {}, service, { commandName: 'decisions', output })
      if (process.exitCode === 2) return
      ensureV3Migration(projectRoot, config)
    }

    const pathResolver = service ? new StatePathResolver(projectRoot, service) : undefined
    const decisions = readDecisions(projectRoot, { step: argv.step, last: argv.last }, pathResolver)

    if (outputMode === 'json') {
      output.result({
        decisions: decisions.map(d => ({
          id: d.id,
          step: d.prompt,
          decision: d.decision,
          rationale: undefined,
          category: d.category,
          actor: d.completed_by,
          timestamp: d.at,
          provisional: d.step_completed === false,
        })),
        total: decisions.length,
      })
    } else {
      if (decisions.length === 0) {
        output.info('No decisions recorded.')
      } else {
        for (const d of decisions) {
          const provisional = d.step_completed === false ? ' [provisional]' : ''
          output.info(`${d.id} [${d.prompt}]${provisional}: ${d.decision}`)
          if (d.category) output.info(`  Category: ${d.category}`)
        }
      }
    }
    process.exit(0)
  },
}

export default decisionsCommand
