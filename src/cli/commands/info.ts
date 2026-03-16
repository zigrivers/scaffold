import type { CommandModule } from 'yargs'
import path from 'node:path'
import { discoverMetaPrompts } from '../../core/assembly/meta-prompt-loader.js'
import { StateManager } from '../../state/state-manager.js'
import { loadConfig } from '../../config/loader.js'
import { createOutputContext } from '../output/context.js'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { findClosestMatch } from '../../utils/levenshtein.js'

interface InfoArgs {
  step?: string
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

const infoCommand: CommandModule<Record<string, unknown>, InfoArgs> = {
  command: 'info [step]',
  describe: 'Show project info or detailed info about a step',
  builder: (yargs) => {
    return yargs.positional('step', {
      type: 'string',
      description: 'Step slug to show info for',
    })
  },
  handler: async (argv) => {
    const projectRoot = argv.root ?? findProjectRoot(process.cwd())
    if (!projectRoot) {
      process.stderr.write(
        '✗ error [PROJECT_NOT_INITIALIZED]: No .scaffold/ directory found\n' +
        '  Fix: Run `scaffold init` to initialize a project\n',
      )
      process.exit(1)
      return
    }

    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    if (!argv.step) {
      // Project info mode
      const { config } = loadConfig(projectRoot, [])
      const stateManager = new StateManager(projectRoot, () => [])
      let state
      try { state = stateManager.loadState() } catch { state = null }

      if (outputMode === 'json') {
        output.result({
          mode: 'project',
          methodology: config?.methodology ?? 'unknown',
          configVersion: config?.version ?? null,
          state: state
            ? { created: state.created, init_methodology: state.init_methodology }
            : null,
        })
      } else {
        output.info(`Methodology: ${config?.methodology ?? 'not configured'}`)
        if (state) {
          output.info(`Created: ${state.created}`)
        }
      }
      process.exit(0)
      return
    }

    // Step info mode
    const metaPrompts = discoverMetaPrompts(path.join(projectRoot, 'pipeline'))
    const mp = metaPrompts.get(argv.step)
    if (!mp) {
      const suggestion = findClosestMatch(argv.step, [...metaPrompts.keys()])
      const msg = suggestion
        ? `Step '${argv.step}' not found. Did you mean '${suggestion}'?`
        : `Step '${argv.step}' not found`
      output.error({ code: 'DEP_TARGET_MISSING', message: msg, exitCode: 1 })
      process.exit(1)
      return
    }

    const stateManager = new StateManager(projectRoot, () => [])
    let state
    try { state = stateManager.loadState() } catch { state = null }
    const stepState = state?.steps?.[argv.step]

    if (outputMode === 'json') {
      output.result({
        mode: 'step',
        slug: mp.stepName,
        description: mp.frontmatter.description,
        phase: mp.frontmatter.phase,
        dependsOn: mp.frontmatter.dependencies ?? [],
        produces: mp.frontmatter.outputs ?? [],
        knowledgeBase: mp.frontmatter.knowledgeBase ?? [],
        status: stepState?.status ?? 'unknown',
        depth: stepState?.depth ?? null,
        completedAt: stepState?.at ?? null,
        completedBy: stepState?.completed_by ?? null,
      })
    } else {
      output.info(`Step: ${mp.stepName}`)
      output.info(`Phase: ${mp.frontmatter.phase ?? 'unspecified'}`)
      output.info(`Description: ${mp.frontmatter.description}`)
      output.info(`Status: ${stepState?.status ?? 'not initialized'}`)
      if (stepState?.status === 'completed') {
        output.info(`Completed at: ${stepState.at}`)
        output.info(`Depth: ${stepState.depth}`)
      }
      output.info(`Depends on: ${(mp.frontmatter.dependencies ?? []).join(', ') || 'none'}`)
      output.info(`Produces: ${(mp.frontmatter.outputs ?? []).join(', ') || 'none'}`)
    }
    process.exit(0)
  },
}

export default infoCommand
