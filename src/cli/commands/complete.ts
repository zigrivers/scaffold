import type { CommandModule, Argv } from 'yargs'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { StateManager } from '../../state/state-manager.js'
import { acquireLock, getLockPath, releaseLock } from '../../state/lock-manager.js'
import { findClosestMatch } from '../../utils/levenshtein.js'
import { loadPipelineContext } from '../../core/pipeline/context.js'
import { resolvePipeline } from '../../core/pipeline/resolver.js'
import { shutdown } from '../shutdown.js'
import { guardStepCommand } from '../guards.js'
import { StatePathResolver } from '../../state/state-path-resolver.js'
import { ensureV3Migration } from '../../state/ensure-v3-migration.js'

interface CompleteArgs {
  step: string
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
  service?: string
}

const completeCommand: CommandModule<Record<string, unknown>, CompleteArgs> = {
  command: 'complete <step>',
  describe: 'Mark a step as completed (for steps executed outside scaffold run)',
  builder: (yargs) => {
    return yargs
      .positional('step', {
        type: 'string',
        description: 'Step slug to mark as completed',
        demandOption: true,
      })
      .option('service', {
        type: 'string',
        describe: 'Target service name (multi-service projects)',
      }) as unknown as Argv<CompleteArgs>
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

    // Guard check (needs globalSteps from pipeline)
    guardStepCommand(
      argv.step, context.config ?? {}, service, pipeline.globalSteps, { commandName: 'complete', output },
    )
    if (process.exitCode === 2) return

    // Acquire lock
    const pathResolver = new StatePathResolver(projectRoot, service)
    const lockResult = acquireLock(projectRoot, 'complete', argv.step, pathResolver)
    if (!lockResult.acquired && !argv.force) {
      if (lockResult.error) {
        output.warn(`${lockResult.error.code}: ${lockResult.error.message}`)
      } else {
        output.warn('Lock is held by another process')
      }
      process.exitCode = 3
      return
    }

    if (lockResult.acquired) {
      const lockFilePath = getLockPath(projectRoot, pathResolver)
      shutdown.registerLockOwnership(lockFilePath)
    }

    await shutdown.withResource('lock', () => {
      if (lockResult.acquired) {
        const lockFilePath = getLockPath(projectRoot, pathResolver)
        releaseLock(projectRoot, pathResolver)
        shutdown.releaseLockOwnership(lockFilePath)
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
      const state = stateManager.loadState()

      // Check step exists in state
      if (!(argv.step in state.steps)) {
        const suggestion = findClosestMatch(argv.step, Object.keys(state.steps))
        const msg = suggestion
          ? `Step '${argv.step}' not found. Did you mean '${suggestion}'?`
          : `Step '${argv.step}' not found`
        output.error({
          code: 'DEP_TARGET_MISSING',
          message: msg,
          exitCode: 2,
          recovery: 'Run `scaffold list` to see available steps',
        })
        process.exitCode = 2
        return
      }

      const stepEntry = state.steps[argv.step]

      // Already completed — report and exit cleanly
      if (stepEntry.status === 'completed') {
        if (outputMode === 'json') {
          output.result({ step: argv.step, status: 'completed', alreadyCompleted: true })
        } else {
          output.info(`Step '${argv.step}' is already completed`)
        }
        process.exitCode = 0
        return
      }

      const previousStatus = stepEntry.status

      // Mark as completed
      state.steps[argv.step] = {
        status: 'completed',
        source: stepEntry.source ?? 'pipeline',
        produces: stepEntry.produces ?? [],
        at: new Date().toISOString(),
        completed_by: 'user',
      }

      // Clear in_progress if it references this step
      if (state.in_progress?.step === argv.step) {
        state.in_progress = null
      }

      stateManager.saveState(state)

      if (outputMode === 'json') {
        output.result({
          step: argv.step,
          previousStatus,
          newStatus: 'completed',
        })
      } else {
        output.success(`Step '${argv.step}' marked as completed (was ${previousStatus})`)
        output.info('Run `scaffold next` to see eligible steps')
      }
      process.exitCode = 0
    })
  },
}

export default completeCommand
