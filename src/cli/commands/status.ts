import type { CommandModule } from 'yargs'
import fs from 'node:fs'
import path from 'node:path'

import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { StateManager } from '../../state/state-manager.js'
import { loadPipelineContext } from '../../core/pipeline/context.js'
import { resolvePipeline } from '../../core/pipeline/resolver.js'
import { PHASES } from '../../types/frontmatter.js'
import { guardSteplessCommand } from '../guards.js'
import { StatePathResolver } from '../../state/state-path-resolver.js'
import { ensureV3Migration } from '../../state/ensure-v3-migration.js'
import { resolveCrossReadReadiness, humanCrossReadStatus } from '../../core/assembly/cross-reads.js'
import { readEligible } from '../../core/pipeline/read-eligible.js'
import { readRootSaveCounter } from '../../state/root-counter-reader.js'
import type { PipelineState } from '../../types/index.js'

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
  service?: string
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
      .option('service', {
        type: 'string',
        describe: 'Target service name (multi-service projects)',
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

    // 3. Load pipeline context and resolve overlay/graph
    const context = loadPipelineContext(projectRoot)
    const service = argv.service as string | undefined
    const pipeline = resolvePipeline(context, { output, serviceId: service })

    // Trigger v2→v3 migration if needed
    ensureV3Migration(projectRoot, context.config, pipeline.globalSteps)

    // Guard check
    guardSteplessCommand(context.config ?? {}, service, { commandName: 'status', output })
    if (process.exitCode === 2) return

    const pathResolver = new StatePathResolver(projectRoot, service)
    const stateManager = new StateManager(
      projectRoot,
      pipeline.computeEligible,
      () => context.config ?? undefined,
      pathResolver,
      pipeline.globalSteps,
      pipeline.getPipelineHash(service ? 'service' : 'global'),
    )

    // Reconcile state with current pipeline — adds any new steps that were
    // introduced after the project was initialized (e.g., story-tests).
    const pipelineSteps = [...context.metaPrompts.values()].map(m => ({
      slug: m.frontmatter.name,
      produces: m.frontmatter.outputs,
      // Steps not in overlay/preset map are disabled. This requires presets to enumerate
      // all known pipeline steps (which they do — see deep.yml/mvp.yml/custom-defaults.yml).
      enabled: pipeline.overlay.steps[m.frontmatter.name]?.enabled ?? false,
    }))
    stateManager.reconcileWithPipeline(pipelineSteps)

    const state = stateManager.loadState()

    // Compute eligible once (cache-validated) — reused by both JSON and
    // interactive output branches. readEligible returns the cached
    // next_eligible list when the graph hash (and root save_counter, for
    // service scope) still match, else falls back to a live compute.
    const scopeOptionsForRead = service
      ? { scope: 'service' as const, globalSteps: pipeline.globalSteps }
      : undefined
    const validatedEligible = readEligible(
      state,
      pipeline,
      scopeOptionsForRead,
      service ? () => readRootSaveCounter(projectRoot) : undefined,
    )

    // 5. Build progress stats
    const { steps } = state
    const completed = Object.values(steps).filter(s => s.status === 'completed').length
    const skipped = Object.values(steps).filter(s => s.status === 'skipped').length
    const pending = Object.values(steps).filter(s => s.status === 'pending').length
    const inProgress = Object.values(steps).filter(s => s.status === 'in_progress').length
    const total = Object.keys(steps).length
    const pct = total > 0 ? Math.round((completed + skipped) / total * 100) : 0

    const methodology =
      (context.config as ConfigWithMethodology)?.methodology?.preset ?? state.config_methodology

    const isCompact = argv.compact === true
    const actionableStatuses = new Set(['pending', 'in_progress'])

    // Wave 3c — compute cross-dep readiness for EVERY surfaced step with crossReads
    // (not just actionable ones — status surfaces completed/skipped too).
    // Cache is hoisted across all steps so each foreign service's state is
    // loaded + migrated at most once per status invocation.
    const crossDepMap = new Map<string, ReturnType<typeof resolveCrossReadReadiness>>()
    const sharedForeignCache = new Map<string, PipelineState | null | 'read-error'>()
    for (const slug of Object.keys(steps)) {
      // overlay.crossReads is the authoritative merged map (frontmatter ∪ overlay
      // overrides) since Wave 3c+1. Defaults to [] for steps not in metaPrompts.
      const crossReads = pipeline.overlay.crossReads[slug] ?? []
      if (crossReads.length > 0 && context.config) {
        crossDepMap.set(
          slug,
          resolveCrossReadReadiness(
            crossReads, context.config, projectRoot,
            pipeline.globalSteps, sharedForeignCache,
          ),
        )
      }
    }

    // 6. Check command staleness
    const staleCommandCount = checkCommandStaleness(projectRoot)

    // Build phases array: group meta-prompts by phase with per-phase counts
    const phasesData = PHASES.map(phaseInfo => {
      const phaseSteps = [...context.metaPrompts.values()]
        .filter(m => m.frontmatter.phase === phaseInfo.slug)
        .map(m => {
          const entry = steps[m.frontmatter.name]
          const cd = crossDepMap.get(m.frontmatter.name)
          return {
            slug: m.frontmatter.name,
            status: entry?.status ?? 'pending',
            ...(cd && cd.length > 0 ? { crossDependencies: cd } : {}),
          }
        })
      const phaseCompleted = phaseSteps.filter(s => s.status === 'completed').length
      const phaseSkipped = phaseSteps.filter(s => s.status === 'skipped').length
      const phasePending = phaseSteps.filter(s => s.status === 'pending').length
      const phaseInProgress = phaseSteps.filter(s => s.status === 'in_progress').length
      return {
        phase: phaseInfo.slug,
        displayName: phaseInfo.displayName,
        total: phaseSteps.length,
        completed: phaseCompleted,
        skipped: phaseSkipped,
        pending: phasePending,
        inProgress: phaseInProgress,
        steps: phaseSteps,
      }
    }).filter(p => p.total > 0)

    // 7. Display or return JSON
    if (outputMode === 'json') {
      const result: Record<string, unknown> = {
        pipeline: { methodology, total, completed, skipped, pending, inProgress },
        progress: { completed, skipped, pending, inProgress, total, percentage: pct },
        phases: phasesData,
        nextEligible: validatedEligible,
        orphaned_entries: [],
        staleCommands: staleCommandCount,
      }
      if (isCompact) {
        result.compact = true
        result.steps = Object.entries(steps)
          .filter(([, entry]) => actionableStatuses.has(entry.status))
          .map(([slug, entry]) => {
            const cd = crossDepMap.get(slug)
            return {
              slug,
              status: entry.status,
              ...(cd && cd.length > 0 ? { crossDependencies: cd } : {}),
            }
          })
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
        const fm = pipeline.stepMeta.get(slug)
        const phase = fm?.phase ?? '?'
        const icon = statusIcons[entry.status] ?? '?'
        if (argv.phase !== undefined && phase !== String(argv.phase)) continue
        output.info(`  ${icon} [${entry.status}] ${slug}`)
        const cd = crossDepMap.get(slug)
        if (cd?.length) {
          for (const cdEntry of cd) {
            const label = humanCrossReadStatus(cdEntry.status)
            output.info(`      cross-reads ${cdEntry.service}:${cdEntry.step} (${label})`)
          }
        }
      }

      // Reuse the cache-validated eligible list computed above.
      const nextEligibleList = validatedEligible.join(', ') || 'none'
      output.info(`\nNext eligible: ${nextEligibleList}`)

      if (staleCommandCount > 0) {
        output.warn(
          `\n⚠ ${staleCommandCount} commands are stale` +
          ' (pipeline/knowledge sources modified after last build).' +
          ' Run `scaffold build` to update.',
        )
      }
    }

    process.exit(0)
  },
}

export default statusCommand
