import type { CommandModule } from 'yargs'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { StateManager } from '../../state/state-manager.js'
import { acquireLock, getLockPath, releaseLock } from '../../state/lock-manager.js'
import { findClosestMatch } from '../../utils/levenshtein.js'
import { loadPipelineContext } from '../../core/pipeline/context.js'
import { resolvePipeline } from '../../core/pipeline/resolver.js'
import { shutdown } from '../shutdown.js'
import { assertSingleServiceOrExit } from '../guards.js'

interface CompleteArgs {
  step: string
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

const completeCommand: CommandModule<Record<string, unknown>, CompleteArgs> = {
  command: 'complete <step>',
  describe: 'Mark a step as completed (for steps executed outside scaffold run)',
  builder: (yargs) => {
    return yargs.positional('step', {
      type: 'string',
      description: 'Step slug to mark as completed',
      demandOption: true,
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
    assertSingleServiceOrExit(context.config ?? {}, { commandName: 'complete', output })
    if (process.exitCode === 2) return

    // Acquire lock
    const lockResult = acquireLock(projectRoot, 'complete', argv.step)
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
      shutdown.registerLockOwnership(getLockPath(projectRoot))
    }

    await shutdown.withResource('lock', () => {
      if (lockResult.acquired) {
        releaseLock(projectRoot)
        shutdown.releaseLockOwnership()
      }
    }, async () => {
      const pipeline = resolvePipeline(context)
      const stateManager = new StateManager(
        projectRoot,
        pipeline.computeEligible,
        () => context.config ?? undefined,
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
