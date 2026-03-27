import type { CommandModule, Argv } from 'yargs'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { StateManager } from '../../state/state-manager.js'
import { acquireLock, releaseLock } from '../../state/lock-manager.js'
import { findClosestMatch } from '../../utils/levenshtein.js'

interface SkipArgs {
  step: string | string[]
  reason?: string
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
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

    // Normalize step to always be an array
    const steps = Array.isArray(argv.step) ? argv.step : [argv.step]
    const isBatch = steps.length > 1

    // Acquire lock
    const lockResult = acquireLock(projectRoot, 'skip', steps[0])
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
      const stateManager = new StateManager(projectRoot, () => [])
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
          results.push({ step: stepSlug, status: 'error', error: `Step '${stepSlug}' is already completed (use --force)` })
          hasErrors = true
          if (outputMode !== 'json') output.warn(`Step '${stepSlug}' is already completed — use --force to re-mark as skipped`)
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

      process.exit(hasErrors ? 2 : 0)
    } finally {
      if (lockResult.acquired) {
        releaseLock(projectRoot)
      }
    }
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
    process.exit(2)
    return
  }

  const stepEntry = state.steps[stepSlug]

  if (stepEntry.status === 'skipped') {
    output.info(`Step '${stepSlug}' is already skipped`)
    process.exit(0)
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
        process.exit(3)
        return
      }
    } else {
      const proceed = await output.confirm(
        `Step '${stepSlug}' is already completed. Re-mark as skipped?`,
        false,
      )
      if (!proceed) {
        process.exit(0)
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
  process.exit(0)
}

export default skipCommand
