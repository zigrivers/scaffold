import type { CommandModule, Argv } from 'yargs'
import fs from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { StateManager } from '../../state/state-manager.js'
import { acquireLock, releaseLock } from '../../state/lock-manager.js'
import { discoverMetaPrompts } from '../../core/assembly/meta-prompt-loader.js'
import { getPackagePipelineDir } from '../../utils/fs.js'
import { runAdoption } from '../../project/adopt.js'

interface AdoptArgs {
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
  'dry-run': boolean
}

const adoptCommand: CommandModule<Record<string, unknown>, AdoptArgs> = {
  command: 'adopt',
  describe: 'Adopt an existing project into scaffold',
  builder: (yargs: Argv<Record<string, unknown>>) => {
    return yargs
      .option('root', { type: 'string', describe: 'Project root directory' })
      .option('dry-run', { type: 'boolean', default: false, describe: 'Preview without writing' })
      .option('force', { type: 'boolean', default: false, describe: 'Force adoption even if state exists' })
      .option('format', { type: 'string', describe: 'Output format' })
      .option('auto', { type: 'boolean', default: false, describe: 'Non-interactive' })
      .option('verbose', { type: 'boolean', default: false, describe: 'Verbose output' }) as Argv<AdoptArgs>
  },
  handler: async (argv) => {
    const projectRoot = argv.root ?? findProjectRoot(process.cwd())

    if (!projectRoot) {
      const output = createOutputContext('auto')
      output.error({ code: 'PROJECT_NOT_INITIALIZED', message: 'No .scaffold/ directory found', exitCode: 1 })
      process.exit(1)
      return
    }

    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    // Acquire lock
    const lockResult = acquireLock(projectRoot, 'adopt')
    if (!lockResult.acquired) {
      if (lockResult.error) output.error(lockResult.error)
      process.exit(3)
      return
    }

    try {
      const dryRun = argv['dry-run'] ?? false
      const metaPromptDir = getPackagePipelineDir(projectRoot)
      const methodology = 'deep'

      const adoptResult = runAdoption({ projectRoot, metaPromptDir, methodology, dryRun })

      if (!dryRun) {
        const stateFile = path.join(projectRoot, '.scaffold', 'state.json')

        if (!fs.existsSync(stateFile)) {
          // Initialize state
          const metaPrompts = discoverMetaPrompts(metaPromptDir)
          const allSteps = [...metaPrompts.entries()].map(([slug, mp]) => ({
            slug,
            produces: mp.frontmatter.outputs ?? [],
          }))
          const stateManager = new StateManager(projectRoot, () => [])
          stateManager.initializeState({
            enabledSteps: allSteps,
            scaffoldVersion: '2.0.0',
            methodology,
            initMode: adoptResult.mode === 'v1-migration'
              ? 'v1-migration'
              : adoptResult.mode === 'brownfield'
                ? 'brownfield'
                : 'greenfield',
          })
        } else {
          // Update existing state — mark stepsCompleted
          const stateManager = new StateManager(projectRoot, () => [])
          const state = stateManager.loadState()
          const now = new Date().toISOString()
          for (const slug of adoptResult.stepsCompleted) {
            if (state.steps[slug]) {
              state.steps[slug] = {
                ...state.steps[slug],
                status: 'completed',
                at: now,
                completed_by: 'scaffold-adopt',
              }
            }
          }
          stateManager.saveState(state)
        }
      }

      // Write detected game config into config.yml
      if (!dryRun && adoptResult.projectType) {
        const configPath = path.join(projectRoot, '.scaffold', 'config.yml')
        let raw: Record<string, unknown> = {}
        if (fs.existsSync(configPath)) {
          try {
            const content = fs.readFileSync(configPath, 'utf8')
            const parsed = yaml.load(content)
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
              raw = parsed as Record<string, unknown>
            }
          } catch { /* start fresh if parse fails */ }
        }
        const project = (raw['project'] ?? {}) as Record<string, unknown>
        project['projectType'] = adoptResult.projectType
        if (adoptResult.gameConfig) {
          project['gameConfig'] = adoptResult.gameConfig
        }
        raw['project'] = project
        fs.writeFileSync(configPath, yaml.dump(raw), 'utf8')
      }

      const resultData = {
        mode: adoptResult.mode,
        artifacts_found: adoptResult.artifactsFound,
        steps_completed: adoptResult.stepsCompleted,
        steps_remaining: adoptResult.stepsRemaining,
        methodology: adoptResult.methodology,
        dry_run: dryRun,
        ...(adoptResult.projectType && { project_type: adoptResult.projectType }),
        ...(adoptResult.gameConfig && { game_config: adoptResult.gameConfig }),
      }

      if (outputMode === 'json') {
        output.result(resultData)
      } else {
        output.success(
          `Adoption complete: ${adoptResult.artifactsFound} artifacts found, ` +
          `${adoptResult.stepsCompleted.length} steps completed`,
        )
      }

      process.exit(0)
    } finally {
      releaseLock(projectRoot)
    }
  },
}

export default adoptCommand
