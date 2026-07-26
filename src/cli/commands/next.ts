import type { CommandModule } from 'yargs'

import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext, exitNotInitialized } from '../output/context.js'
import { StateManager } from '../../state/state-manager.js'
import { loadPipelineContext } from '../../core/pipeline/context.js'
import { resolvePipeline } from '../../core/pipeline/resolver.js'
import { guardSteplessCommand } from '../guards.js'
import { StatePathResolver } from '../../state/state-path-resolver.js'
import { ensureV3Migration } from '../../state/ensure-v3-migration.js'
import { resolveCrossReadReadiness, humanCrossReadStatus } from '../../core/assembly/cross-reads.js'
import { readEligible } from '../../core/pipeline/read-eligible.js'
import { readRootSaveCounter } from '../../state/root-counter-reader.js'
import { applyConflictOverrides } from '../../state/completion.js'
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
      exitNotInitialized(argv)
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
    // Multi-service root: when config defines services[] and no
    // --service was passed, root state holds only global steps; tell
    // computeEligible to filter to globals-only via scope: 'global'.
    const isMultiServiceRoot =
      !service && (context.config?.project?.services?.length ?? 0) > 0
    const scopeOptions =
      service
        ? { scope: 'service' as const, globalSteps: pipeline.globalSteps }
        : isMultiServiceRoot
          ? { scope: 'global' as const, globalSteps: pipeline.globalSteps }
          : undefined
    // D3: conflict overrides completed — fs-only demotion (never runs detect: cmds).
    // Pass the CURRENT resolved outputs so an upgraded output contract is honored.
    const conflictCheck = applyConflictOverrides(
      state.steps, projectRoot, (slug) => pipeline.stepMeta.get(slug)?.outputs,
      service, pipeline.globalSteps, context.config?.artifact_map,
    )
    const conflictCount = conflictCheck.conflicts.length
    if (conflictCount > 0) {
      output.warn(
        `${conflictCount} completed step(s) failed the artifact check and are treated as not completed: `
        + `${conflictCheck.conflicts.join(', ')}. Run \`scaffold adopt\` to review.`,
      )
    }
    const eligible = conflictCount > 0
      ? pipeline.computeEligible(conflictCheck.steps, scopeOptions)
      : readEligible(
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

    // 5. Check pipeline completion. Now that we don't reconcile, the
    //    pipeline-graph is the source of truth for "what steps exist";
    //    state may have no entry for newly-enabled steps. Compute from
    //    the enabled pipeline ∩ state intersection: pending if missing
    //    or status === 'pending', done if 'completed' or 'skipped'.
    //
    //    "Enabled" = explicitly set to `true` in the overlay (presets
    //    enumerate every known pipeline step, so a step absent from
    //    overlay is "not in this project"). This matches the prior
    //    reconciliation default (`?? false`).
    //
    //    Scope-aware filter — three modes (matches readEligible scope
    //    above):
    //    - service mode (--service <name>): exclude global steps.
    //    - multi-service root mode (config.services[] present, no
    //      --service): include only global steps; service-local steps
    //      live in per-service state and shouldn't gate root completion.
    //    - flat / single-project mode: include everything.
    const inScope = (slug: string): boolean => {
      if (service) return !pipeline.globalSteps.has(slug)
      if (isMultiServiceRoot) return pipeline.globalSteps.has(slug)
      return true
    }
    const enabledPipelineSlugs = [...context.metaPrompts.keys()]
      .filter(slug => pipeline.overlay.steps[slug]?.enabled === true)
      .filter(inScope)
    // D3: read the CONFLICT-OVERRIDDEN record so a completed step with missing
    // outputs (demoted to pending) cannot report "Pipeline complete!" — conflict
    // overrides completed everywhere completion is consumed. conflictCheck.steps
    // is the same object as state.steps when nothing conflicts (Task 4).
    const allDone =
      enabledPipelineSlugs.length > 0 &&
      enabledPipelineSlugs.every(slug => {
        const status = conflictCheck.steps[slug]?.status
        return status === 'completed' || status === 'skipped'
      })

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
