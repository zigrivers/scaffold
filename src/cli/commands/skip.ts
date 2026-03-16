import type { CommandModule, Argv } from 'yargs'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { StateManager } from '../../state/state-manager.js'
import { acquireLock, releaseLock } from '../../state/lock-manager.js'
import { findClosestMatch } from '../../utils/levenshtein.js'

interface SkipArgs {
  step: string
  reason?: string
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

const skipCommand: CommandModule<Record<string, unknown>, SkipArgs> = {
  command: 'skip <step>',
  describe: 'Skip a pipeline step',
  builder: (yargs: Argv) => {
    return yargs
      .positional('step', {
        type: 'string',
        description: 'Step slug to skip',
        demandOption: true,
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

    // Acquire lock
    const lockResult = acquireLock(projectRoot, 'skip', argv.step)
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

      // Check step exists
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
        process.exit(2)
        return
      }

      const stepEntry = state.steps[argv.step]

      // Handle already-skipped
      if (stepEntry.status === 'skipped') {
        output.info(`Step '${argv.step}' is already skipped`)
        process.exit(0)
        return
      }

      // Handle already-completed
      if (stepEntry.status === 'completed') {
        if (outputMode !== 'interactive') {
          if (!argv.force) {
            output.error({
              code: 'PSM_INVALID_TRANSITION',
              message: `Step '${argv.step}' is already completed`,
              exitCode: 3,
              recovery: 'Use --force to re-mark as skipped',
            })
            process.exit(3)
            return
          }
        } else {
          const proceed = await output.confirm(
            `Step '${argv.step}' is already completed. Re-mark as skipped?`,
            false,
          )
          if (!proceed) {
            process.exit(0)
            return
          }
        }
      }

      // Handle in_progress warning
      if (stepEntry.status === 'in_progress') {
        output.warn(
          `Step '${argv.step}' appears to be in progress \u2014 an agent session may be actively executing it`,
        )
      }

      // Mark skipped
      stateManager.markSkipped(argv.step, argv.reason ?? 'user-requested', 'scaffold-skip')

      // Compute newly eligible
      const newState = stateManager.loadState()
      const newlyEligible: string[] = newState.next_eligible ?? []

      if (outputMode === 'json') {
        output.result({
          step: argv.step,
          reason: argv.reason ?? 'user-requested',
          skippedAt: new Date().toISOString(),
          newly_eligible: newlyEligible,
        })
      } else {
        output.success(`Step '${argv.step}' marked as skipped`)
        if (newlyEligible.length > 0) {
          output.info(`Newly eligible: ${newlyEligible.join(', ')}`)
        }
      }
      process.exit(0)
    } finally {
      if (lockResult.acquired) {
        releaseLock(projectRoot)
      }
    }
  },
}

export default skipCommand
