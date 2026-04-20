import type { CommandModule, Argv } from 'yargs'
import type { ScaffoldConfig } from '../../types/index.js'
import fs from 'node:fs'
import path from 'node:path'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { StateManager } from '../../state/state-manager.js'
import { acquireLock, getLockPath, releaseLock } from '../../state/lock-manager.js'
import { shutdown } from '../shutdown.js'
import { findClosestMatch } from '../../utils/levenshtein.js'
import { loadPipelineContext } from '../../core/pipeline/context.js'
import { resolvePipeline } from '../../core/pipeline/resolver.js'
import { guardStepCommand, guardSteplessCommand } from '../guards.js'
import { StatePathResolver } from '../../state/state-path-resolver.js'
import { ensureV3Migration } from '../../state/ensure-v3-migration.js'

interface ResetArgs {
  step?: string
  confirmReset?: boolean
  'confirm-reset'?: boolean
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
  service?: string
}

const resetCommand: CommandModule<Record<string, unknown>, ResetArgs> = {
  command: 'reset [step]',
  describe: 'Reset a step to pending, or reset entire pipeline state',
  builder: (yargs: Argv) => {
    return yargs
      .positional('step', {
        type: 'string',
        description: 'Step slug to reset to pending (omit for full pipeline reset)',
      })
      .option('confirm-reset', {
        type: 'boolean',
        description: 'Required in --auto mode to confirm full pipeline reset',
        default: false,
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

    // Route: single step reset vs full pipeline reset
    if (argv.step) {
      guardStepCommand(argv.step, context.config ?? {}, service, pipeline.globalSteps, { commandName: 'reset', output })
      if (process.exitCode === 2) return
      await resetStep(argv.step, projectRoot, outputMode, output, argv, service, pipeline)
    } else {
      guardSteplessCommand(context.config ?? {}, service, { commandName: 'reset', output })
      if (process.exitCode === 2) return
      await resetPipeline(projectRoot, outputMode, output, argv, service, context.config)
    }
  },
}

/**
 * Reset a single step back to pending.
 */
async function resetStep(
  step: string,
  projectRoot: string,
  outputMode: string,
  output: ReturnType<typeof import('../output/context.js').createOutputContext>,
  argv: ResetArgs,
  service?: string,
  pipeline?: ReturnType<typeof resolvePipeline>,
): Promise<void> {
  const pathResolver = new StatePathResolver(projectRoot, service)
  // Acquire lock
  const lockResult = acquireLock(projectRoot, 'reset', step, pathResolver)
  if (!lockResult.acquired && !argv.force) {
    if (lockResult.error) {
      output.warn(`${lockResult.error.code}: ${lockResult.error.message}`)
    } else {
      output.warn('Lock is held by another process')
    }
    process.exit(3)
    return
  }

  const doReset = async (): Promise<void> => {
    const context = loadPipelineContext(projectRoot)
    const resolvedPipeline = pipeline ?? resolvePipeline(context)
    const stateManager = new StateManager(
      projectRoot,
      resolvedPipeline.computeEligible,
      () => context.config ?? undefined,
      pathResolver,
      resolvedPipeline.globalSteps,
      resolvedPipeline.getPipelineHash(service ? 'service' : 'global'),
    )
    const state = stateManager.loadState()

    // Check step exists in state
    if (!(step in state.steps)) {
      const suggestion = findClosestMatch(step, Object.keys(state.steps))
      const msg = suggestion
        ? `Step '${step}' not found. Did you mean '${suggestion}'?`
        : `Step '${step}' not found`
      output.error({
        code: 'DEP_TARGET_MISSING',
        message: msg,
        exitCode: 2,
        recovery: 'Run `scaffold list` to see available steps',
      })
      process.exitCode = 2
      return
    }

    const stepEntry = state.steps[step]

    // Already pending — nothing to do
    if (stepEntry.status === 'pending') {
      output.info(`Step '${step}' is already pending`)
      process.exitCode = 0
      return
    }

    // Warn if in_progress
    if (stepEntry.status === 'in_progress') {
      output.warn(
        `Step '${step}' appears to be in progress — an agent session may be actively executing it`,
      )
    }

    // Confirm if completed (interactive mode)
    if (stepEntry.status === 'completed' && outputMode === 'interactive') {
      const proceed = await shutdown.withPrompt(() =>
        output.confirm(
          `Step '${step}' is completed. Reset to pending? (You can re-run it afterward.)`,
          false,
        ),
      )
      if (!proceed) {
        process.exitCode = 0
        return
      }
    } else if (stepEntry.status === 'completed' && !argv.force) {
      output.error({
        code: 'PSM_INVALID_TRANSITION',
        message: `Step '${step}' is completed. Use --force to reset.`,
        exitCode: 3,
        recovery: 'Use --force to reset a completed step',
      })
      process.exitCode = 3
      return
    }

    // Reset step to pending
    state.steps[step] = {
      status: 'pending',
      source: stepEntry.source ?? 'pipeline',
      produces: stepEntry.produces ?? [],
    }

    // Clear in_progress if it references this step
    if (state.in_progress?.step === step) {
      state.in_progress = null
    }

    stateManager.saveState(state)

    if (outputMode === 'json') {
      output.result({
        step,
        previousStatus: stepEntry.status,
        newStatus: 'pending',
      })
    } else {
      output.success(`Step '${step}' reset to pending`)
      output.info('Run `scaffold next` to see eligible steps')
    }
    process.exitCode = 0
  }

  if (lockResult.acquired) {
    const lockFilePath = getLockPath(projectRoot, pathResolver)
    shutdown.registerLockOwnership(lockFilePath)
    await shutdown.withResource('lock', () => {
      releaseLock(projectRoot, pathResolver)
      shutdown.releaseLockOwnership(lockFilePath)
    }, doReset)
  } else {
    // --force bypass: no lock acquired, run without withResource
    await doReset()
  }
}

/**
 * Full pipeline reset (delete state.json and decisions.jsonl).
 */
async function resetPipeline(
  projectRoot: string,
  outputMode: string,
  output: ReturnType<typeof import('../output/context.js').createOutputContext>,
  argv: ResetArgs,
  service?: string,
  config?: ScaffoldConfig | null,
): Promise<void> {
  const scaffoldDir = path.join(projectRoot, '.scaffold')

  // Confirmation logic — prompt happens BEFORE lock acquisition
  const confirmFlagSet = argv['confirm-reset'] === true || argv.confirmReset === true

  if (outputMode === 'interactive') {
    const confirmed = await shutdown.withPrompt(() =>
      output.confirm(
        'This will delete state.json and decisions.jsonl. Are you sure?',
        false,
      ),
    )
    if (!confirmed) {
      output.info('Reset cancelled.')
      process.exit(0)
      return
    }
  } else if (!confirmFlagSet) {
    output.error({
      code: 'RESET_CONFIRM_REQUIRED',
      message: 'Use --confirm-reset flag in auto mode to confirm reset',
      exitCode: 1,
      recovery: 'Add --confirm-reset flag',
    })
    process.exit(1)
    return
  }

  const doReset = async (): Promise<void> => {
    const filesDeleted: string[] = []
    const filesPreserved: string[] = []

    if (service) {
      // Service-scoped reset: delete only that service's state/decisions/rework files
      const serviceResolver = new StatePathResolver(projectRoot, service)
      for (const [file, label] of [
        [serviceResolver.statePath, `.scaffold/services/${service}/state.json`],
        [serviceResolver.decisionsPath, `.scaffold/services/${service}/decisions.jsonl`],
        [serviceResolver.reworkPath, `.scaffold/services/${service}/rework.json`],
      ] as [string, string][]) {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file)
          filesDeleted.push(label)
        }
      }
    } else {
      // Global reset: delete root state + decisions + all service directories
      // Delete state.json
      const statePath = path.join(scaffoldDir, 'state.json')
      if (fs.existsSync(statePath)) {
        fs.unlinkSync(statePath)
        filesDeleted.push('.scaffold/state.json')
      }

      // Delete decisions.jsonl
      const decisionsPath = path.join(scaffoldDir, 'decisions.jsonl')
      if (fs.existsSync(decisionsPath)) {
        fs.unlinkSync(decisionsPath)
        filesDeleted.push('.scaffold/decisions.jsonl')
      }

      // If multi-service project, also delete services/ directory
      if (config?.project?.services?.length) {
        const servicesDir = path.join(scaffoldDir, 'services')
        if (fs.existsSync(servicesDir)) {
          fs.rmSync(servicesDir, { recursive: true })
          filesDeleted.push('.scaffold/services/')
        }
      }
    }

    // Preserve config.yml (global reset only)
    if (!service) {
      const configPath = path.join(scaffoldDir, 'config.yml')
      if (fs.existsSync(configPath)) {
        filesPreserved.push('.scaffold/config.yml')
      }
    }

    if (outputMode === 'json') {
      output.result({ files_deleted: filesDeleted, files_preserved: filesPreserved })
    } else {
      output.success(`Reset complete. Deleted: ${filesDeleted.join(', ') || 'none'}`)
      if (filesPreserved.length > 0) {
        output.info(`Preserved: ${filesPreserved.join(', ')}`)
      }
    }
    process.exitCode = 0
  }

  if (argv.force) {
    // --force bypass: no lock acquisition, run directly
    await doReset()
  } else {
    // Acquire lock (use global lock for full reset)
    const lockResult = acquireLock(projectRoot, 'reset')
    if (!lockResult.acquired) {
      if (lockResult.error) {
        output.warn(`${lockResult.error.code}: ${lockResult.error.message}`)
      } else {
        output.warn('Lock is held by another process')
      }
      process.exit(3)
      return
    }

    const lockFilePath = getLockPath(projectRoot)
    shutdown.registerLockOwnership(lockFilePath)
    await shutdown.withResource('lock', () => {
      releaseLock(projectRoot)
      shutdown.releaseLockOwnership(lockFilePath)
    }, doReset)
  }
}

export default resetCommand
