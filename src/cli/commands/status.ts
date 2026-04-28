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

    // `scaffold status` is a read-only inspection. We deliberately do NOT
    // call reconcileWithPipeline here — pre-populating pending entries
    // for every enabled pipeline step is convenient but causes state.json
    // (which is committed in most projects) to churn whenever a scaffold
    // version upgrade adds steps or methodology changes flip enable bits.
    // Eligibility, phasesData, and progress totals are all derivable from
    // the pipeline graph + overlay + state intersection, so the persisted
    // pending-entries are not required.
    const state = stateManager.loadState()

    // Multi-service root: when config defines services[] and no
    // --service was passed, we're operating at the root scope. Root
    // state holds only global steps; service-local steps live in
    // per-service state. The scope filter must skip them on every
    // surface, and readEligible must use 'global' scope so its
    // cached/live eligibility computation matches.
    const isMultiServiceRoot =
      !service && (context.config?.project?.services?.length ?? 0) > 0

    // Compute eligible once — readEligible returns the cached
    // next_eligible list when the graph hash (and root save_counter, for
    // service scope) still match, else falls back to a live compute.
    const scopeOptionsForRead =
      service
        ? { scope: 'service' as const, globalSteps: pipeline.globalSteps }
        : isMultiServiceRoot
          ? { scope: 'global' as const, globalSteps: pipeline.globalSteps }
          : undefined
    const validatedEligible = readEligible(
      state,
      pipeline,
      scopeOptionsForRead,
      service ? () => readRootSaveCounter(projectRoot) : undefined,
    )

    // 5. Build the unified "surfaced" slug set used by progress totals,
    //    phasesData, the interactive listing, and compact JSON. Keeping
    //    them all in sync prevents the inconsistency where, e.g., a
    //    historical disabled+completed entry shows up in phases (audit)
    //    but doesn't count toward progress totals.
    //
    //    A slug is surfaced if it is:
    //    (a) enabled in the active overlay (explicit `enabled: true`), OR
    //    (b) preserved disabled state entry with non-pending status
    //        (history / active-work audit, kept by reconcile-prune).
    //
    //    "Enabled" = explicitly `enabled: true` in overlay. Presets
    //    enumerate every known pipeline step, so a step absent from
    //    overlay is "not in this project". Matches the prior
    //    reconciliation default (`?? false`) so totals don't inflate.
    const { steps } = state
    // Scope filter — three cases, matching computeEligible's scope arg
    // (eligibility.ts:33-37) and state-manager.ts:229's reconcile path:
    //   - service mode (--service <name>): exclude global steps;
    //     they belong to root state.
    //   - multi-service root mode (services[] but no --service): include
    //     only global steps; service-local steps live in per-service
    //     state and shouldn't inflate root totals.
    //   - flat / single-project mode (no services[]): include
    //     everything (no scope concept).
    const isInScope = (slug: string): boolean => {
      if (service) return !pipeline.globalSteps.has(slug)
      if (isMultiServiceRoot) return pipeline.globalSteps.has(slug)
      return true
    }
    const enabledSlugs = [...context.metaPrompts.keys()]
      .filter(slug => pipeline.overlay.steps[slug]?.enabled === true)
      .filter(isInScope)
    const auditDisabledSlugs = Object.entries(steps)
      .filter(([slug, entry]) =>
        pipeline.overlay.steps[slug]?.enabled !== true && entry.status !== 'pending')
      .filter(([slug]) => isInScope(slug))
      .map(([slug]) => slug)
    const surfacedSlugs = [...new Set<string>([...enabledSlugs, ...auditDisabledSlugs])]
    const statusOf = (slug: string): string =>
      steps[slug]?.status ?? 'pending'
    const completed = surfacedSlugs.filter(s => statusOf(s) === 'completed').length
    const skipped = surfacedSlugs.filter(s => statusOf(s) === 'skipped').length
    const inProgress = surfacedSlugs.filter(s => statusOf(s) === 'in_progress').length
    const total = surfacedSlugs.length
    const pending = total - completed - skipped - inProgress
    const pct = total > 0 ? Math.round((completed + skipped) / total * 100) : 0

    const methodology =
      (context.config as ConfigWithMethodology)?.methodology?.preset
      ?? state.config_methodology
      ?? 'unknown'

    const isCompact = argv.compact === true
    const actionableStatuses = new Set(['pending', 'in_progress'])

    // Wave 3c — compute cross-dep readiness for EVERY surfaced step with crossReads
    // (not just actionable ones — status surfaces completed/skipped too).
    // Cache is hoisted across all steps so each foreign service's state is
    // loaded + migrated at most once per status invocation.
    //
    // Iterate the pipeline (metaPrompts ∪ state.steps) rather than state
    // alone: now that we don't reconcile, state may not yet contain
    // entries for every enabled pipeline step, but the cross-dep
    // readiness UI must still show them. Union with state covers any
    // historical entries for steps no longer in metaPrompts.
    const crossDepMap = new Map<string, ReturnType<typeof resolveCrossReadReadiness>>()
    const sharedForeignCache = new Map<string, PipelineState | null | 'read-error'>()
    for (const slug of surfacedSlugs) {
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

    // Build phases array from the same `surfacedSlugs` set used for
    // progress totals. This guarantees totals/phases/listing/compact
    // stay in lockstep — every surface answers the same "is this slug
    // part of the project's view right now?" question via one set,
    // rather than each surface re-deriving the answer with a slightly
    // different predicate.
    const surfacedSet = new Set<string>(surfacedSlugs)
    const phasesData = PHASES.map(phaseInfo => {
      const phaseSteps = [...context.metaPrompts.values()]
        .filter(m => m.frontmatter.phase === phaseInfo.slug)
        .filter(m => surfacedSet.has(m.frontmatter.name))
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
        // Compact JSON also derives from `surfacedSlugs` — same source
        // of truth as phases and progress totals.
        result.steps = surfacedSlugs
          .map(slug => {
            const entry = steps[slug]
            const status = entry?.status ?? 'pending'
            return { slug, status }
          })
          .filter(({ status }) => actionableStatuses.has(status))
          .map(({ slug, status }) => {
            const cd = crossDepMap.get(slug)
            return {
              slug,
              status,
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

      // Interactive listing also iterates `surfacedSlugs` — single
      // source of truth shared with phases / compact / progress totals.
      for (const slug of surfacedSlugs) {
        const entry = steps[slug]
        const status = entry?.status ?? 'pending'
        if (isCompact && !actionableStatuses.has(status)) continue
        const fm = pipeline.stepMeta.get(slug)
        const phase = fm?.phase ?? '?'
        const icon = statusIcons[status] ?? '?'
        if (argv.phase !== undefined && phase !== String(argv.phase)) continue
        output.info(`  ${icon} [${status}] ${slug}`)
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
