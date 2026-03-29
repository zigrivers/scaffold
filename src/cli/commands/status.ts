import type { CommandModule } from 'yargs'
import fs from 'node:fs'
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

/** Check if any pipeline/knowledge source is newer than its generated command. */
function checkCommandStaleness(projectRoot: string): number {
  const commandsDir = path.join(projectRoot, 'commands')
  const sourceDirs = [
    path.join(projectRoot, 'pipeline'),
    path.join(projectRoot, 'knowledge'),
  ]

  if (!fs.existsSync(commandsDir)) return 0

  let newestSource = 0
  for (const dir of sourceDirs) {
    if (!fs.existsSync(dir)) continue
    const walk = (d: string): void => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name)
        if (entry.isDirectory()) { walk(full) }
        else if (entry.name.endsWith('.md')) {
          const mtime = fs.statSync(full).mtimeMs
          if (mtime > newestSource) newestSource = mtime
        }
      }
    }
    walk(dir)
  }

  let staleCount = 0
  let oldestCommand = Infinity
  for (const entry of fs.readdirSync(commandsDir)) {
    if (!entry.endsWith('.md')) continue
    const mtime = fs.statSync(path.join(commandsDir, entry)).mtimeMs
    if (mtime < oldestCommand) oldestCommand = mtime
  }

  if (newestSource > oldestCommand) {
    // Count how many commands are older than the newest source
    for (const entry of fs.readdirSync(commandsDir)) {
      if (!entry.endsWith('.md')) continue
      const mtime = fs.statSync(path.join(commandsDir, entry)).mtimeMs
      if (mtime < newestSource) staleCount++
    }
  }

  return staleCount
}

interface StatusArgs {
  phase?: number
  compact?: boolean
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
    return yargs
      .option('phase', {
        type: 'number',
        description: 'Filter output to a specific phase number',
      })
      .option('compact', {
        type: 'boolean',
        description: 'Show only actionable steps (pending and in-progress)',
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

    // Reconcile state with current pipeline — adds any new steps that were
    // introduced after the project was initialized (e.g., story-tests).
    const pipelineSteps = [...metaPrompts.values()].map(m => ({
      slug: m.frontmatter.name,
      produces: m.frontmatter.outputs,
      enabled: presetSteps.get(m.frontmatter.name)?.enabled ?? true,
    }))
    stateManager.reconcileWithPipeline(pipelineSteps)

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

    const isCompact = argv.compact === true
    const actionableStatuses = new Set(['pending', 'in_progress'])

    // 6. Check command staleness
    const staleCommandCount = checkCommandStaleness(projectRoot)

    // 7. Display or return JSON
    if (outputMode === 'json') {
      const result: Record<string, unknown> = {
        pipeline: { methodology, total, completed, skipped, pending, inProgress },
        progress: { completed, skipped, pending, inProgress, total, percentage: pct },
        phases: [],
        nextEligible: state.next_eligible,
        orphaned_entries: [],
        staleCommands: staleCommandCount,
      }
      if (isCompact) {
        result.compact = true
        result.steps = Object.entries(steps)
          .filter(([, entry]) => actionableStatuses.has(entry.status))
          .map(([slug, entry]) => ({ slug, status: entry.status }))
      }
      output.result(result)
    } else {
      if (isCompact) {
        output.info(`Pipeline: ${methodology} | Progress: ${pct}% (${completed}/${total})`)
        output.info(`  ${completed} completed, ${skipped} skipped, ${pending} pending, ${inProgress} in progress`)
      } else {
        output.info(`Pipeline: ${methodology} | Progress: ${pct}% (${completed}/${total})`)
      }

      const statusIcons: Record<string, string> = {
        completed: '✓',
        skipped: '→',
        in_progress: '●',
        pending: '○',
      }

      for (const [slug, entry] of Object.entries(steps)) {
        if (isCompact && !actionableStatuses.has(entry.status)) continue
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

      if (staleCommandCount > 0) {
        output.warn(`\n⚠ ${staleCommandCount} commands are stale (pipeline/knowledge sources modified after last build). Run \`scaffold build\` to update.`)
      }
    }

    process.exit(0)
  },
}

export default statusCommand
