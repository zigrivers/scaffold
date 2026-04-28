import type { CommandModule, Argv } from 'yargs'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { StateManager } from '../../state/state-manager.js'
import { acquireLock, getLockPath, releaseLock } from '../../state/lock-manager.js'
import { shutdown } from '../shutdown.js'
import { findClosestMatch } from '../../utils/levenshtein.js'
import { loadPipelineContext } from '../../core/pipeline/context.js'
import { resolvePipeline } from '../../core/pipeline/resolver.js'
import { guardStepCommand } from '../guards.js'
import { StatePathResolver } from '../../state/state-path-resolver.js'
import { ensureV3Migration } from '../../state/ensure-v3-migration.js'

interface SkipArgs {
  step: string | string[]
  reason?: string
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
  service?: string
}

interface SkipResult {
  step: string
  status: 'skipped' | 'already_skipped' | 'error'
  reason?: string
  error?: string
}

const skipCommand: CommandModule<Record<string, unknown>, SkipArgs> = {
  command: 'skip <step..>',
  describe: 'Skip one or more pipeline steps',
  builder: (yargs: Argv) => {
    return yargs
      .positional('step', {
        type: 'string',
        description: 'Step slug(s) to skip',
        demandOption: true,
        array: true,
      })
      .option('reason', {
        type: 'string',
        description: 'Reason for skipping',
      })
      .option('service', {
        type: 'string',
        describe: 'Target service name (multi-service projects)',
      })
  },
  handler: async (argv) => {
    const projectRoot = argv.root ?? findProjectRoot(process.cwd())
    if (!projectRoot) {
      process.stderr.write('\u2717 error [PROJECT_NOT_INITIALIZED]: No .scaffold/ directory found\n')
      process.exit(1)
      return
    }

    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    const context = loadPipelineContext(projectRoot)
    const service = argv.service as string | undefined
    const pipeline = resolvePipeline(context, { output, serviceId: service })

    // Trigger v2→v3 migration if needed
    ensureV3Migration(projectRoot, context.config, pipeline.globalSteps)

    // Normalize step to always be an array
    const steps = Array.isArray(argv.step) ? argv.step : [argv.step]
    const isBatch = steps.length > 1

    // Guard check (needs globalSteps from pipeline)
    guardStepCommand(steps[0], context.config ?? {}, service, pipeline.globalSteps, { commandName: 'skip', output })
    if (process.exitCode === 2) return

    // Acquire lock
    const pathResolver = new StatePathResolver(projectRoot, service)
    const lockResult = acquireLock(projectRoot, 'skip', steps[0], pathResolver)
    if (!lockResult.acquired && !argv.force) {
      if (lockResult.error) {
        output.warn(`${lockResult.error.code}: ${lockResult.error.message}`)
      } else {
        output.warn('Lock is held by another process')
      }
      process.exit(3)
      return
    }

    if (lockResult.acquired) {
      const lockFilePath = getLockPath(projectRoot, pathResolver)
      shutdown.registerLockOwnership(lockFilePath)
    }

    await shutdown.withResource('lock', () => {
      if (lockResult.acquired) {
        const lockFilePath = getLockPath(projectRoot, pathResolver)
        releaseLock(projectRoot, pathResolver); shutdown.releaseLockOwnership(lockFilePath)
      }
    }, async () => {
      const stateManager = new StateManager(
        projectRoot,
        pipeline.computeEligible,
        () => context.config ?? undefined,
        pathResolver,
        pipeline.globalSteps,
        pipeline.getPipelineHash(service ? 'service' : 'global'),
      )
      // Reconcile state with the current pipeline before checking
      // step existence. Without this, `scaffold skip <new-step>` for
      // a step added in a recent scaffold version upgrade would fail
      // with "step not found" because the entry was never auto-added
      // to state (status/next no longer reconcile on read since
      // v3.24.3). Reconcile is only run from explicit user actions
      // now — and skip is one of them.
      const pipelineSteps = [...context.metaPrompts.values()].map(m => ({
        slug: m.frontmatter.name,
        produces: m.frontmatter.outputs,
        enabled: pipeline.overlay.steps[m.frontmatter.name]?.enabled === true,
      }))
      stateManager.reconcileWithPipeline(pipelineSteps)
      const state = stateManager.loadState()
      const reason = argv.reason ?? 'user-requested'

      if (!isBatch) {
        // --- Single step: preserve original behavior exactly ---
        const stepSlug = steps[0]
        await skipSingle(stepSlug, state, stateManager, reason, outputMode, output, argv.force)
        return
      }

      // --- Batch mode ---
      const results: SkipResult[] = []
      let hasErrors = false

      for (const stepSlug of steps) {
        if (!(stepSlug in state.steps)) {
          const suggestion = findClosestMatch(stepSlug, Object.keys(state.steps))
          const msg = suggestion
            ? `Step '${stepSlug}' not found. Did you mean '${suggestion}'?`
            : `Step '${stepSlug}' not found`
          results.push({ step: stepSlug, status: 'error', error: msg })
          hasErrors = true
          if (outputMode !== 'json') output.warn(msg)
          continue
        }

        const entry = state.steps[stepSlug]

        if (entry.status === 'skipped') {
          results.push({ step: stepSlug, status: 'already_skipped' })
          if (outputMode !== 'json') output.info(`Step '${stepSlug}' is already skipped`)
          continue
        }

        if (entry.status === 'completed' && !argv.force) {
          results.push({
            step: stepSlug,
            status: 'error',
            error: `Step '${stepSlug}' is already completed (use --force)`,
          })
          hasErrors = true
          if (outputMode !== 'json') {
            output.warn(
              `Step '${stepSlug}' is already completed — use --force to re-mark as skipped`,
            )
          }
          continue
        }

        if (entry.status === 'in_progress') {
          if (outputMode !== 'json') {
            output.warn(`Step '${stepSlug}' appears to be in progress — an agent session may be actively executing it`)
          }
        }

        stateManager.markSkipped(stepSlug, reason, 'scaffold-skip')
        results.push({ step: stepSlug, status: 'skipped', reason })
        if (outputMode !== 'json') output.success(`Step '${stepSlug}' marked as skipped`)
      }

      // Compute newly eligible after all skips
      const newState = stateManager.loadState()
      const newlyEligible: string[] = newState.next_eligible ?? []

      if (outputMode === 'json') {
        output.result({
          results,
          reason,
          newly_eligible: newlyEligible,
        })
      } else if (newlyEligible.length > 0) {
        output.info(`Newly eligible: ${newlyEligible.join(', ')}`)
      }

      process.exitCode = hasErrors ? 2 : 0
    })
  },
}

/** Handle single-step skip with original behavior (prompts, error codes, etc.) */
async function skipSingle(
  stepSlug: string,
  state: ReturnType<StateManager['loadState']>,
  stateManager: StateManager,
  reason: string,
  outputMode: string,
  output: ReturnType<typeof createOutputContext>,
  force?: boolean,
): Promise<void> {
  if (!(stepSlug in state.steps)) {
    const suggestion = findClosestMatch(stepSlug, Object.keys(state.steps))
    const msg = suggestion
      ? `Step '${stepSlug}' not found. Did you mean '${suggestion}'?`
      : `Step '${stepSlug}' not found`
    output.error({
      code: 'DEP_TARGET_MISSING',
      message: msg,
      exitCode: 2,
      recovery: 'Run `scaffold list` to see available steps',
    })
    process.exitCode = 2
    return
  }

  const stepEntry = state.steps[stepSlug]

  if (stepEntry.status === 'skipped') {
    output.info(`Step '${stepSlug}' is already skipped`)
    process.exitCode = 0
    return
  }

  if (stepEntry.status === 'completed') {
    if (outputMode !== 'interactive') {
      if (!force) {
        output.error({
          code: 'PSM_INVALID_TRANSITION',
          message: `Step '${stepSlug}' is already completed`,
          exitCode: 3,
          recovery: 'Use --force to re-mark as skipped',
        })
        process.exitCode = 3
        return
      }
    } else {
      const proceed = await shutdown.withPrompt(() => output.confirm(
        `Step '${stepSlug}' is already completed. Re-mark as skipped?`,
        false,
      ))
      if (!proceed) {
        process.exitCode = 0
        return
      }
    }
  }

  if (stepEntry.status === 'in_progress') {
    output.warn(
      `Step '${stepSlug}' appears to be in progress \u2014 an agent session may be actively executing it`,
    )
  }

  stateManager.markSkipped(stepSlug, reason, 'scaffold-skip')

  const newState = stateManager.loadState()
  const newlyEligible: string[] = newState.next_eligible ?? []

  if (outputMode === 'json') {
    output.result({
      step: stepSlug,
      reason,
      skippedAt: new Date().toISOString(),
      newly_eligible: newlyEligible,
    })
  } else {
    output.success(`Step '${stepSlug}' marked as skipped`)
    if (newlyEligible.length > 0) {
      output.info(`Newly eligible: ${newlyEligible.join(', ')}`)
    }
  }
  process.exitCode = 0
}

export default skipCommand
