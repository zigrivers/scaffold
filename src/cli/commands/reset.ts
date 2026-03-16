import type { CommandModule } from 'yargs'
import fs from 'node:fs'
import path from 'node:path'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { acquireLock, releaseLock } from '../../state/lock-manager.js'

interface ResetArgs {
  confirmReset?: boolean
  'confirm-reset'?: boolean
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

const resetCommand: CommandModule<Record<string, unknown>, ResetArgs> = {
  command: 'reset',
  describe: 'Reset pipeline state (preserves config)',
  builder: (yargs) => {
    return yargs.option('confirm-reset', {
      type: 'boolean',
      description: 'Required in --auto mode to confirm reset',
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

      // Preserve config.yml (note its presence for output)
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
      if (!argv.force) {
        try {
          releaseLock(projectRoot)
        } catch {
          // ignore
        }
      }
    }
  },
}

export default resetCommand
