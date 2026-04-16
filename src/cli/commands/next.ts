import type { CommandModule } from 'yargs'

import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { StateManager } from '../../state/state-manager.js'
import { loadPipelineContext } from '../../core/pipeline/context.js'
import { resolvePipeline } from '../../core/pipeline/resolver.js'

interface NextArgs {
  count?: number
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

const nextCommand: CommandModule<Record<string, unknown>, NextArgs> = {
  command: 'next',
  describe: 'Show next eligible step(s)',
  builder: (yargs) => {
    return yargs.option('count', {
      type: 'number',
      description: 'Show up to N next eligible steps',
    })
  },
  handler: async (argv) => {
    // 1. Resolve project root
    const projectRoot = argv.root ?? findProjectRoot(process.cwd())
    if (!projectRoot) {
      process.stderr.write(
        '✗ error [PROJECT_NOT_INITIALIZED]: No .scaffold/ directory found\n',
      )
      process.stderr.write(
        '  Fix: Run `scaffold init` to initialize a project\n',
      )
      process.exit(1)
      return
    }

    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    // 2. Load pipeline context and resolve overlay/graph
    const context = loadPipelineContext(projectRoot)
    const pipeline = resolvePipeline(context, { output })
    const stateManager = new StateManager(
      projectRoot,
      pipeline.computeEligible,
      () => context.config ?? undefined,
    )

    // Reconcile state with current pipeline — adds any new steps that were
    // introduced after the project was initialized.
    const pipelineSteps = [...context.metaPrompts.values()].map(m => ({
      slug: m.frontmatter.name,
      produces: m.frontmatter.outputs,
      // Steps not in overlay/preset map are disabled. This requires presets to enumerate
      // all known pipeline steps (which they do — see deep.yml/mvp.yml/custom-defaults.yml).
      enabled: pipeline.overlay.steps[m.frontmatter.name]?.enabled ?? false,
    }))
    stateManager.reconcileWithPipeline(pipelineSteps)

    const state = stateManager.loadState()
    const eligible = pipeline.computeEligible(state.steps)

    // 4. Apply --count limit
    const count = argv.count ?? eligible.length
    const shown = eligible.slice(0, count)

    // 5. Check pipeline completion
    const stepValues = Object.values(state.steps)
    const allDone =
      stepValues.length > 0 &&
      stepValues.every(s => s.status === 'completed' || s.status === 'skipped')

    if (outputMode === 'json') {
      output.result({
        eligible: shown.map(s => {
          const fm = pipeline.stepMeta.get(s)
          return {
            slug: s,
            description: fm?.description ?? '',
            summary: fm?.summary ?? null,
            command: `scaffold run ${s}`,
          }
        }),
        blocked_steps: [],
        pipeline_complete: allDone,
      })
    } else {
      if (allDone) {
        output.success('Pipeline complete!')
      } else if (shown.length === 0) {
        output.warn('No eligible steps. Check dependencies.')
      } else {
        output.info(`Next eligible steps (${shown.length}):`)
        for (const slug of shown) {
          const fm = pipeline.stepMeta.get(slug)
          const desc = fm?.summary ?? fm?.description ?? ''
          output.info(`  scaffold run ${slug}  — ${desc}`)
        }
      }
    }

    process.exit(0)
  },
}

export default nextCommand
