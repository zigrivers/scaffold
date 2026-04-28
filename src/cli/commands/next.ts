import type { CommandModule } from 'yargs'

import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { StateManager } from '../../state/state-manager.js'
import { loadPipelineContext } from '../../core/pipeline/context.js'
import { resolvePipeline } from '../../core/pipeline/resolver.js'
import { guardSteplessCommand } from '../guards.js'
import { StatePathResolver } from '../../state/state-path-resolver.js'
import { ensureV3Migration } from '../../state/ensure-v3-migration.js'
import { resolveCrossReadReadiness, humanCrossReadStatus } from '../../core/assembly/cross-reads.js'
import { readEligible } from '../../core/pipeline/read-eligible.js'
import { readRootSaveCounter } from '../../state/root-counter-reader.js'
import type { PipelineState } from '../../types/index.js'

interface NextArgs {
  count?: number
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
  service?: string
}

const nextCommand: CommandModule<Record<string, unknown>, NextArgs> = {
  command: 'next',
  describe: 'Show next eligible step(s)',
  builder: (yargs) => {
    return yargs
      .option('count', {
        type: 'number',
        description: 'Show up to N next eligible steps',
      })
      .option('service', {
        type: 'string',
        describe: 'Target service name (multi-service projects)',
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
    const service = argv.service as string | undefined
    const pipeline = resolvePipeline(context, { output, serviceId: service })

    // Trigger v2→v3 migration if needed
    ensureV3Migration(projectRoot, context.config, pipeline.globalSteps)

    // Guard check
    guardSteplessCommand(context.config ?? {}, service, { commandName: 'next', output })
    if (process.exitCode === 2) return

    const pathResolver = new StatePathResolver(projectRoot, service)
    const stateManager = new StateManager(
      projectRoot,
      pipeline.computeEligible,
      () => context.config ?? undefined,
      pathResolver,
      pipeline.globalSteps,
      pipeline.getPipelineHash(service ? 'service' : 'global'),
    )

    // `scaffold next` is a read-only inspection. We deliberately do NOT
    // call reconcileWithPipeline here — eligibility is derived live from
    // the pipeline graph + state, and `computeEligible` treats steps
    // missing from state as pending (the same default reconcile would
    // pre-populate). Skipping reconcile prevents committed state.json
    // from churning every time the user runs `scaffold next` after a
    // version upgrade or methodology change.
    const state = stateManager.loadState()
    const scopeOptions = service
      ? { scope: 'service' as const, globalSteps: pipeline.globalSteps }
      : undefined
    const eligible = readEligible(
      state,
      pipeline,
      scopeOptions,
      service ? () => readRootSaveCounter(projectRoot) : undefined,
    )

    // 4. Apply --count limit
    const count = argv.count ?? eligible.length
    const shown = eligible.slice(0, count)

    // Wave 3c — compute cross-dep readiness for each shown step with crossReads.
    // Cache is hoisted across all shown steps so each foreign service's state
    // is loaded + migrated at most once per next invocation.
    const crossDepMap = new Map<string, ReturnType<typeof resolveCrossReadReadiness>>()
    const sharedForeignCache = new Map<string, PipelineState | null | 'read-error'>()
    for (const slug of shown) {
      // overlay.crossReads is the authoritative merged map (frontmatter ∪ overlay
      // overrides) since Wave 3c+1. Defaults to [] for steps not in metaPrompts.
      const crossReads = pipeline.overlay.crossReads[slug] ?? []
      if (crossReads.length > 0 && context.config) {
        crossDepMap.set(
          slug,
          resolveCrossReadReadiness(
            crossReads, context.config, projectRoot,
            pipeline.globalSteps, sharedForeignCache,
          ),
        )
      }
    }

    // 5. Check pipeline completion
    const stepValues = Object.values(state.steps)
    const allDone =
      stepValues.length > 0 &&
      stepValues.every(s => s.status === 'completed' || s.status === 'skipped')

    if (outputMode === 'json') {
      output.result({
        eligible: shown.map(s => {
          const fm = pipeline.stepMeta.get(s)
          const cd = crossDepMap.get(s)
          return {
            slug: s,
            description: fm?.description ?? '',
            summary: fm?.summary ?? null,
            command: `scaffold run ${s}`,
            ...(cd && cd.length > 0 ? { crossDependencies: cd } : {}),
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
          const cd = crossDepMap.get(slug)
          if (cd?.length) {
            for (const entry of cd) {
              output.info(`    cross-reads ${entry.service}:${entry.step} (${humanCrossReadStatus(entry.status)})`)
            }
          }
        }
      }
    }

    process.exit(0)
  },
}

export default nextCommand
