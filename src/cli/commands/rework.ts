import type { CommandModule, Argv } from 'yargs'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext, exitNotInitialized } from '../output/context.js'
import { ExitCode } from '../../types/enums.js'
import { displayErrors } from '../output/error-display.js'
import { acquireLock, getLockPath, releaseLock } from '../../state/lock-manager.js'
import { ReworkManager } from '../../state/rework-manager.js'
import { StateManager } from '../../state/state-manager.js'
import { loadPipelineContext } from '../../core/pipeline/context.js'
import { resolvePipeline } from '../../core/pipeline/resolver.js'
import { loadConfig } from '../../config/loader.js'
import { guardSteplessCommand } from '../guards.js'
import { ensureV3Migration } from '../../state/ensure-v3-migration.js'
import { parsePhases, parseThrough, applyExclusions, resolveStepsForPhases } from '../../core/rework/phase-selector.js'
import type { DepthLevel } from '../../types/enums.js'
import type { ReworkConfig } from '../../types/index.js'
import { PHASES } from '../../types/frontmatter.js'
import { shutdown } from '../shutdown.js'

interface ReworkArgs {
  phases?: string
  through?: number
  exclude?: string
  depth?: number
  fix?: boolean
  fresh?: boolean
  auto?: boolean
  resume?: boolean
  clear?: boolean
  advance?: string
  format?: string
  verbose?: boolean
  root?: string
  force?: boolean
  service?: string
}

const reworkCommand: CommandModule<Record<string, unknown>, ReworkArgs> = {
  command: 'rework',
  describe: 'Re-run pipeline steps by phase for depth improvement or cleanup',
  builder: (yargs: Argv) => {
    return yargs
      .option('phases', {
        type: 'string',
        description: 'Phase numbers or ranges (e.g., 1-5, 1,3,5, 1-3,5)',
      })
      .option('through', {
        type: 'number',
        description: 'Shorthand for phases 1 through N',
      })
      .option('exclude', {
        type: 'string',
        description: 'Exclude specific phases (e.g., 3,5)',
      })
      .option('depth', {
        type: 'number',
        description: 'Override depth for all steps (1-5)',
      })
      .option('fix', {
        type: 'boolean',
        description: 'Auto-fix issues in review steps',
        default: true,
      })
      .option('fresh', {
        type: 'boolean',
        description: 'Wipe artifacts before re-running',
        default: false,
      })
      .option('resume', {
        type: 'boolean',
        description: 'Resume an interrupted rework session',
        default: false,
      })
      .option('clear', {
        type: 'boolean',
        description: 'Clear an active rework session',
        default: false,
      })
      .option('advance', {
        type: 'string',
        description: 'Mark a step as completed (used by runner skill)',
      })
      .option('service', {
        type: 'string',
        description: 'Target service name (multi-service projects)',
      })
  },
  handler: async (argv) => {
    const projectRoot = argv.root ?? findProjectRoot(process.cwd())
    if (!projectRoot) {
      exitNotInitialized(argv)
      return
    }

    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)
    const service = argv.service as string | undefined
    const reworkManager = new ReworkManager(projectRoot as string, service)

    // --- Branch: --clear ---
    if (argv.clear) {
      reworkManager.clearSession()
      if (outputMode === 'json') {
        output.result({ action: 'cleared' })
      } else {
        output.success('Rework session cleared')
      }
      process.exit(0)
      return
    }

    // --- Branch: --advance <step> ---
    if (argv.advance) {
      if (!reworkManager.hasSession()) {
        output.fail([{
          code: 'REWORK_SESSION_MISSING',
          message: 'No active rework session',
          exitCode: ExitCode.ValidationError,
          recovery: 'Run "scaffold rework" to create a new rework session',
        }])
        process.exitCode = ExitCode.ValidationError
        return
      }

      try {
        reworkManager.advanceStep(argv.advance)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const exitCode = (err as { exitCode?: number }).exitCode ?? 2
        output.fail([{
          code: 'REWORK_ADVANCE_FAILED',
          message,
          exitCode,
          recovery: 'Read the message above; `scaffold rework --clear` abandons a stuck session',
        }])
        process.exitCode = exitCode
        return
      }

      // Check if all steps are done
      const session = reworkManager.loadSession()
      const allDone = session.steps.every(s => s.status !== 'pending' && s.status !== 'in_progress')

      if (allDone) {
        if (outputMode === 'json') {
          output.result({
            action: 'completed',
            step: argv.advance,
            stats: session.stats,
            all_done: true,
          })
        } else {
          const { completed, failed, skipped } = session.stats
          output.success(
            `Rework complete: ${completed} completed, ${failed} failed, ${skipped} skipped`,
          )
        }
        reworkManager.clearSession()
      } else {
        const nextStep = reworkManager.nextStep()
        if (outputMode === 'json') {
          output.result({
            action: 'advanced',
            step: argv.advance,
            stats: session.stats,
            next_step: nextStep?.name ?? null,
            all_done: false,
          })
        } else {
          output.success(`Step '${argv.advance}' completed`)
          if (nextStep) {
            output.info(`Next: ${nextStep.name}`)
          }
        }
      }
      process.exit(0)
      return
    }

    // --- Branch: --resume ---
    if (argv.resume) {
      if (!reworkManager.hasSession()) {
        output.fail([{
          code: 'REWORK_SESSION_MISSING',
          message: 'No active rework session to resume',
          exitCode: ExitCode.ValidationError,
          recovery: 'Run "scaffold rework" to create a new rework session',
        }])
        process.exitCode = ExitCode.ValidationError
        return
      }

      const session = reworkManager.loadSession()
      const nextStep = reworkManager.nextStep()

      if (outputMode === 'json') {
        output.result(session)
      } else {
        output.info(
          `Active rework: ${session.stats.completed}/${session.stats.total} steps completed` +
          (nextStep ? `. Next: ${nextStep.name}` : '. All steps done.'),
        )
      }
      process.exit(0)
      return
    }

    // --- Branch: new rework ---

    // Guard: validate service flag before phase resolution and lock acquisition
    const { config: guardConfig } = loadConfig(projectRoot as string, [])
    ensureV3Migration(projectRoot as string, guardConfig)
    if (!guardSteplessCommand(guardConfig ?? {}, service, { commandName: 'rework', output })) return

    // Check for existing session
    if (reworkManager.hasSession() && !argv.force) {
      output.fail([{
        code: 'REWORK_SESSION_EXISTS',
        message: 'A rework session already exists',
        exitCode: ExitCode.ValidationError,
        recovery: 'Use --resume to continue, --clear to remove, or --force to replace',
      }])
      process.exitCode = ExitCode.ValidationError
      return
    }

    // Clear existing session if forcing
    if (reworkManager.hasSession() && argv.force) {
      reworkManager.clearSession()
    }

    // Resolve phases
    let phaseNumbers: number[]
    if (argv.through != null) {
      phaseNumbers = parseThrough(argv.through)
    } else if (argv.phases != null) {
      phaseNumbers = parsePhases(argv.phases)
    } else if (outputMode !== 'interactive') {
      // Auto/json mode requires explicit phase selection
      output.fail([{
        code: 'REWORK_NO_PHASES',
        message: 'No phases specified',
        exitCode: ExitCode.ValidationError,
        recovery: 'Use --phases or --through to specify which phases to rework',
      }])
      process.exitCode = ExitCode.ValidationError
      return
    } else {
      // Interactive mode — show phase selector
      // For now, require explicit flags
      output.fail([{
        code: 'REWORK_NO_PHASES',
        message: 'Interactive phase selection not yet implemented. Use --phases or --through.',
        exitCode: ExitCode.ValidationError,
        recovery: 'Use --phases 1-5 or --through 5 to specify phases',
      }])
      process.exitCode = ExitCode.ValidationError
      return
    }

    // Apply exclusions
    if (argv.exclude) {
      const excludePhases = parsePhases(argv.exclude)
      phaseNumbers = applyExclusions(phaseNumbers, excludePhases)
    }

    if (phaseNumbers.length === 0) {
      output.fail([{
        code: 'REWORK_NO_PHASES',
        message: 'No phases selected after applying exclusions',
        exitCode: ExitCode.ValidationError,
        recovery: 'Widen --phases/--through, or drop some of the --exclude phases',
      }])
      process.exitCode = ExitCode.ValidationError
      return
    }

    // Acquire lock
    const lockResult = acquireLock(projectRoot as string, 'rework')
    if (!lockResult.acquired && !argv.force) {
      output.fail([{
        code: 'LOCK_HELD',
        message: 'Another scaffold process is running. Use --force to override.',
        exitCode: ExitCode.StateCorruption,
        recovery: 'Wait for the other process to finish, or pass --force to take the lock',
      }])
      process.exitCode = 3
      return
    }

    if (lockResult.acquired) {
      shutdown.registerLockOwnership(getLockPath(projectRoot as string))
    }

    await shutdown.withResource('lock', () => {
      if (lockResult.acquired) {
        releaseLock(projectRoot as string)
        shutdown.releaseLockOwnership()
      }
    }, async () => {
      // Load pipeline context and resolve overlay/graph
      const context = loadPipelineContext(projectRoot as string)
      if (!context.config) {
        displayErrors(context.configErrors, context.configWarnings, output)
        process.exitCode = ExitCode.ValidationError
        return
      }
      const pipeline = resolvePipeline(context, { output })
      // Note: rework does NOT yet route to service state (pre-existing behavior —
      // pipeline and StateManager both use global/root scope regardless of
      // --service). Always stamp the 'global' hash so the hash matches the
      // state file we actually write. A full multi-service rework is tracked
      // separately.
      const stateManager = new StateManager(
        projectRoot as string,
        pipeline.computeEligible,
        () => context.config ?? undefined,
        undefined,
        undefined,
        pipeline.getPipelineHash('global'),
      )
      const state = stateManager.loadState()

      const metaPromptList = [...context.metaPrompts.values()].map(m => m.frontmatter)

      // Resolve steps for selected phases
      const reworkSteps = resolveStepsForPhases(phaseNumbers, metaPromptList, state, pipeline.graph)

      if (reworkSteps.length === 0) {
        output.fail([{
          code: 'REWORK_NO_STEPS',
          message: `No eligible steps found in phases ${phaseNumbers.join(', ')}`,
          exitCode: ExitCode.ValidationError,
          recovery: 'Check that the selected phases have steps that are not skipped',
        }])
        process.exitCode = ExitCode.ValidationError
        return
      }

      // Batch-reset selected steps in state.json
      for (const step of reworkSteps) {
        if (state.steps[step.name]) {
          state.steps[step.name].status = 'pending'
          delete state.steps[step.name].at
          delete state.steps[step.name].completed_by
          delete state.steps[step.name].depth
          delete state.steps[step.name].reason
        }
      }
      if (state.in_progress) {
        const inProgressInRework = reworkSteps.some(s => s.name === state.in_progress?.step)
        if (inProgressInRework) {
          state.in_progress = null
        }
      }
      stateManager.saveState(state)

      // Create rework config
      const reworkConfig: ReworkConfig = {
        phases: phaseNumbers,
        depth: argv.depth != null ? (argv.depth as DepthLevel) : null,
        fix: argv.fix !== false,
        fresh: argv.fresh === true,
        auto: argv.auto === true,
      }

      // Create session
      const session = reworkManager.createSession(reworkConfig, reworkSteps)

      // Output
      const phaseDisplay = phaseNumbers
        .map(n => PHASES.find(p => p.number === n)?.displayName ?? `Phase ${n}`)
        .join(', ')
      const depthDisplay = reworkConfig.depth != null ? ` at depth ${reworkConfig.depth}` : ''

      if (outputMode === 'json') {
        output.result(session)
      } else {
        output.success(
          `Rework plan created: ${reworkSteps.length} steps across ${phaseDisplay}${depthDisplay}`,
        )
      }
      process.exitCode = 0
    })
  },
}

export default reworkCommand
