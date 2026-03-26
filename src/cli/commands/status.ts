import type { CommandModule } from 'yargs'
import path from 'node:path'
import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { loadConfig } from '../../config/loader.js'
import { StateManager } from '../../state/state-manager.js'
import { discoverMetaPrompts } from '../../core/assembly/meta-prompt-loader.js'
import { getPackagePipelineDir, getPackageMethodologyDir } from '../../utils/fs.js'
import { loadAllPresets } from '../../core/assembly/preset-loader.js'
import { buildGraph } from '../../core/dependency/graph.js'
import { computeEligible } from '../../core/dependency/eligibility.js'

interface StatusArgs {
  phase?: number
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
  force?: boolean
}

type ConfigWithMethodology = { methodology?: { preset?: string } } | null

const statusCommand: CommandModule<Record<string, unknown>, StatusArgs> = {
  command: 'status',
  describe: 'Show pipeline progress and step statuses',
  builder: (yargs) => {
    return yargs.option('phase', {
      type: 'number',
      description: 'Filter output to a specific phase number',
    })
  },
  handler: async (argv) => {
    // 1. Resolve project root
    const projectRoot = argv.root ?? findProjectRoot(process.cwd())
    if (!projectRoot) {
      process.stderr.write(
        '✗ error [PROJECT_NOT_INITIALIZED]: No .scaffold/ directory found\n',
      )
      process.stderr.write(
        '  Fix: Run `scaffold init` to initialize a project\n',
      )
      process.exit(1)
      return
    }

    // 2. Resolve output mode and create context
    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    // 3. Load config and discover meta-prompts
    const { config } = loadConfig(projectRoot, [])
    const metaPrompts = discoverMetaPrompts(getPackagePipelineDir(projectRoot))

    // 4. Load methodology preset for correct eligibility computation
    const methodologyDir = getPackageMethodologyDir(projectRoot)
    const presets = loadAllPresets(methodologyDir, [...metaPrompts.keys()])
    const configMethodology =
      (config as Record<string, unknown>)?.methodology as string ?? 'deep'
    const preset = configMethodology === 'mvp'
      ? presets.mvp
      : configMethodology === 'custom'
        ? presets.custom ?? presets.deep
        : presets.deep
    const presetSteps = new Map(Object.entries(preset?.steps ?? {}))

    const computeEligibleFn = (steps: Parameters<typeof computeEligible>[1]) => {
      const graph = buildGraph(
        [...metaPrompts.values()].map(m => m.frontmatter),
        presetSteps,
      )
      return computeEligible(graph, steps)
    }

    const stateManager = new StateManager(projectRoot, computeEligibleFn)
    const state = stateManager.loadState()

    // 5. Build progress stats
    const { steps } = state
    const completed = Object.values(steps).filter(s => s.status === 'completed').length
    const skipped = Object.values(steps).filter(s => s.status === 'skipped').length
    const pending = Object.values(steps).filter(s => s.status === 'pending').length
    const inProgress = Object.values(steps).filter(s => s.status === 'in_progress').length
    const total = Object.keys(steps).length
    const pct = total > 0 ? Math.round((completed + skipped) / total * 100) : 0

    const methodology =
      (config as ConfigWithMethodology)?.methodology?.preset ?? state.config_methodology

    // 6. Display or return JSON
    if (outputMode === 'json') {
      output.result({
        pipeline: { methodology, total, completed, skipped, pending, inProgress },
        progress: { completed, skipped, pending, inProgress, total, percentage: pct },
        phases: [],
        nextEligible: state.next_eligible,
        orphaned_entries: [],
      })
    } else {
      output.info(`Pipeline: ${methodology} | Progress: ${pct}% (${completed}/${total})`)

      const statusIcons: Record<string, string> = {
        completed: '✓',
        skipped: '→',
        in_progress: '●',
        pending: '○',
      }

      for (const [slug, entry] of Object.entries(steps)) {
        const mp = metaPrompts.get(slug)
        const phase = mp?.frontmatter?.phase ?? '?'
        const icon = statusIcons[entry.status] ?? '?'
        if (argv.phase !== undefined && phase !== String(argv.phase)) continue
        output.info(`  ${icon} [${entry.status}] ${slug}`)
      }

      // Compute eligible live (don't rely on stale cache in state.json)
      const graph = buildGraph(
        [...metaPrompts.values()].map(m => m.frontmatter),
        presetSteps,
      )
      const liveEligible = computeEligible(graph, state.steps)
      const nextEligibleList = liveEligible.join(', ') || 'none'
      output.info(`\nNext eligible: ${nextEligibleList}`)
    }

    process.exit(0)
  },
}

export default statusCommand
