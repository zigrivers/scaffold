import type { CommandModule, Argv } from 'yargs'
import fs from 'node:fs'
import path from 'node:path'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { StateManager } from '../../state/state-manager.js'
import { acquireLock, releaseLock } from '../../state/lock-manager.js'
import { findClosestMatch } from '../../utils/levenshtein.js'
import { buildComputeEligibleFn } from '../../utils/eligible.js'

interface ResetArgs {
  step?: string
  confirmReset?: boolean
  'confirm-reset'?: boolean
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
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

    // Route: single step reset vs full pipeline reset
    if (argv.step) {
      await resetStep(argv.step, projectRoot, outputMode, output, argv)
    } else {
      await resetPipeline(projectRoot, outputMode, output, argv)
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
): Promise<void> {
  // Acquire lock
  const lockResult = acquireLock(projectRoot, 'reset', step)
  if (!lockResult.acquired && !argv.force) {
    if (lockResult.error) {
      output.warn(`${lockResult.error.code}: ${lockResult.error.message}`)
    } else {
      output.warn('Lock is held by another process')
    }
    process.exit(3)
    return
  }

  try {
    const stateManager = new StateManager(projectRoot, buildComputeEligibleFn(projectRoot))
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
      process.exit(2)
      return
    }

    const stepEntry = state.steps[step]

    // Already pending — nothing to do
    if (stepEntry.status === 'pending') {
      output.info(`Step '${step}' is already pending`)
      process.exit(0)
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
      const proceed = await output.confirm(
        `Step '${step}' is completed. Reset to pending? (You can re-run it afterward.)`,
        false,
      )
      if (!proceed) {
        process.exit(0)
        return
      }
    } else if (stepEntry.status === 'completed' && !argv.force) {
      output.error({
        code: 'PSM_INVALID_TRANSITION',
        message: `Step '${step}' is completed. Use --force to reset.`,
        exitCode: 3,
        recovery: 'Use --force to reset a completed step',
      })
      process.exit(3)
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
    process.exit(0)
  } finally {
    if (lockResult.acquired) {
      releaseLock(projectRoot)
    }
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
): Promise<void> {
  const scaffoldDir = path.join(projectRoot, '.scaffold')

  // Confirmation logic
  const confirmFlagSet = argv['confirm-reset'] === true || argv.confirmReset === true

  if (outputMode === 'interactive') {
    const confirmed = await output.confirm(
      'This will delete state.json and decisions.jsonl. Are you sure?',
      false,
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

  // Acquire lock
  let lockAcquired = false
  if (!argv.force) {
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
    lockAcquired = true
  }

  const filesDeleted: string[] = []
  const filesPreserved: string[] = []

  try {
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

    // Preserve config.yml
    const configPath = path.join(scaffoldDir, 'config.yml')
    if (fs.existsSync(configPath)) {
      filesPreserved.push('.scaffold/config.yml')
    }

    if (outputMode === 'json') {
      output.result({ files_deleted: filesDeleted, files_preserved: filesPreserved })
    } else {
      output.success(`Reset complete. Deleted: ${filesDeleted.join(', ') || 'none'}`)
      if (filesPreserved.length > 0) {
        output.info(`Preserved: ${filesPreserved.join(', ')}`)
      }
    }
    process.exit(0)
  } finally {
    if (lockAcquired) {
      try {
        releaseLock(projectRoot)
      } catch {
        // ignore
      }
    }
  }
}

export default resetCommand
