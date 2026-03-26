import type { Argv, CommandModule } from 'yargs'
import path from 'node:path'
import fs from 'node:fs'
import { StateManager } from '../../state/state-manager.js'
import { acquireLock, releaseLock } from '../../state/lock-manager.js'
import { analyzeCrash } from '../../state/completion.js'
import { AssemblyEngine } from '../../core/assembly/engine.js'
import { discoverMetaPrompts } from '../../core/assembly/meta-prompt-loader.js'
import { getPackagePipelineDir, getPackageMethodologyDir, getPackageKnowledgeDir } from '../../utils/fs.js'
import { buildIndexWithOverrides, loadEntries } from '../../core/assembly/knowledge-loader.js'
import { loadInstructions } from '../../core/assembly/instruction-loader.js'
import { resolveDepth } from '../../core/assembly/depth-resolver.js'
import { detectUpdateMode } from '../../core/assembly/update-mode.js'
import { detectMethodologyChange } from '../../core/assembly/methodology-change.js'
import { loadAllPresets } from '../../core/assembly/preset-loader.js'
import { loadConfig } from '../../config/loader.js'
import { buildGraph } from '../../core/dependency/graph.js'
import { detectCycles, topologicalSort } from '../../core/dependency/dependency.js'
import { computeEligible } from '../../core/dependency/eligibility.js'
import { findProjectRoot } from '../../cli/middleware/project-root.js'
import { createOutputContext } from '../../cli/output/context.js'
import { displayErrors } from '../../cli/output/error-display.js'
import { resolveOutputMode } from '../../cli/middleware/output-mode.js'
import { findClosestMatch } from '../../utils/levenshtein.js'
import type { DepthLevel } from '../../types/enums.js'
import type { ArtifactEntry } from '../../types/assembly.js'

interface RunArgs {
  step: string
  depth?: number
  instructions?: string
  force?: boolean
  format?: string
  auto?: boolean
  verbose?: boolean
  root?: string
}

const runCommand: CommandModule<Record<string, unknown>, RunArgs> = {
  command: 'run <step>',
  describe: 'Run a pipeline step',
  builder: (yargs: Argv<Record<string, unknown>>): Argv<RunArgs> => {
    return yargs
      .positional('step', {
        type: 'string',
        description: 'Step name to run',
        demandOption: true,
      })
      .option('depth', {
        type: 'number',
        description: 'Override methodology depth for this run (1-5)',
      })
      .option('instructions', {
        type: 'string',
        description: 'Inline instruction text',
      })
      .option('force', {
        type: 'boolean',
        description: 'Skip lock check and update-mode confirmation',
        default: false,
      }) as unknown as Argv<RunArgs>
  },
  handler: async (argv) => {
    const step = argv.step

    // -----------------------------------------------------------------------
    // Step 1: Resolve context
    // -----------------------------------------------------------------------
    const projectRoot = argv.root ?? findProjectRoot(process.cwd())
    if (!projectRoot) {
      process.stderr.write(
        '✗ error [PROJECT_NOT_INITIALIZED]: No .scaffold/ directory found\n' +
        '  Fix: Run `scaffold init` to initialize a project\n',
      )
      process.exit(1)
    }

    const outputMode = resolveOutputMode(argv)
    const output = createOutputContext(outputMode)

    const { config, errors: configErrors } = loadConfig(projectRoot, [])
    if (!config) {
      displayErrors(configErrors, [], output)
      process.exit(1)
    }

    // -----------------------------------------------------------------------
    // Step 2: Discover meta-prompts and pipeline
    // -----------------------------------------------------------------------
    const pipelineDir = getPackagePipelineDir(projectRoot)
    const metaPrompts = discoverMetaPrompts(pipelineDir)

    const metaPrompt = metaPrompts.get(step)
    if (!metaPrompt) {
      const candidates = [...metaPrompts.keys()]
      const suggestion = findClosestMatch(step, candidates, 3)
      const suggestionText = suggestion ? ` Did you mean '${suggestion}'?` : ''
      output.error({
        code: 'STEP_NOT_FOUND',
        message: `Step '${step}' not found in pipeline.${suggestionText}`,
        exitCode: 1,
        recovery: `Available steps: ${candidates.join(', ')}`,
      })
      process.exit(1)
    }

    const methodologyDir = getPackageMethodologyDir(projectRoot)
    const presets = loadAllPresets(methodologyDir, [...metaPrompts.keys()])

    const preset = config.methodology === 'mvp'
      ? presets.mvp
      : config.methodology === 'custom'
        ? presets.custom ?? presets.deep
        : presets.deep

    const resolvedPreset = preset ?? {
      name: 'deep',
      description: 'Default deep methodology',
      default_depth: 3 as DepthLevel,
      steps: {},
    }

    // -----------------------------------------------------------------------
    // Step 3: Acquire lock
    // -----------------------------------------------------------------------
    const lockResult = acquireLock(projectRoot, 'run', step)
    let lockAcquired = lockResult.acquired

    if (!lockAcquired) {
      if (!argv.force) {
        if (lockResult.error) {
          output.warn({
            code: lockResult.error.code,
            message: lockResult.error.message,
          })
        }
        output.warn({ code: 'LOCK_HELD', message: 'Another scaffold process is running. Use --force to override.' })
        process.exit(3)
      }
      // --force: proceed without lock
      lockAcquired = false
    }

    if (lockResult.warning) {
      output.warn(lockResult.warning)
    }

    // -----------------------------------------------------------------------
    // Step 4: Load and validate state
    // -----------------------------------------------------------------------

    const computeEligibleFn = (steps: Parameters<typeof computeEligible>[1]) => {
      const graph = buildGraph(
        [...metaPrompts.values()].map(m => m.frontmatter),
        new Map(Object.entries(resolvedPreset.steps)),
      )
      return computeEligible(graph, steps)
    }

    const stateManager = new StateManager(projectRoot, computeEligibleFn)
    let state = stateManager.loadState()

    // Crash recovery: in_progress is non-null from a previous run
    if (state.in_progress !== null) {
      const crashAction = analyzeCrash(state, projectRoot)

      if (crashAction.action === 'auto_complete') {
        const lastDepth = (state.steps[state.in_progress.step]?.depth ?? 3) as DepthLevel
        stateManager.markCompleted(
          state.in_progress.step,
          [],
          'scaffold-crash-recovery',
          lastDepth,
        )
        stateManager.clearInProgress()
      } else if (crashAction.action === 'ask_user') {
        if (outputMode === 'auto' || outputMode === 'json') {
          const crashedStep = state.in_progress.step
          output.warn({
            code: 'CRASH_RECOVERY_NEEDED',
            message:
              `Previous run of '${crashedStep}' may be incomplete. ` +
              'Some artifacts present, some missing. ' +
              'Please manually verify and use --force to continue.',
          })
          if (lockAcquired) releaseLock(projectRoot)
          process.exit(4)
        } else {
          // Interactive: prompt user
          const shouldComplete = await output.confirm(
            `Previous run of '${state.in_progress.step}' appears partially complete. Mark as completed?`,
            false,
          )
          if (shouldComplete) {
            const lastDepth = (state.steps[state.in_progress.step]?.depth ?? 3) as DepthLevel
            stateManager.markCompleted(state.in_progress.step, [], 'scaffold-crash-recovery', lastDepth)
            stateManager.clearInProgress()
          } else {
            stateManager.clearInProgress()
          }
        }
      } else {
        // recommend_rerun: just clear
        stateManager.clearInProgress()
      }

      // Reload state after recovery
      state = stateManager.loadState()
    }

    // -----------------------------------------------------------------------
    // Step 5: Check dependencies
    // -----------------------------------------------------------------------
    const presetStepsMap = new Map(Object.entries(resolvedPreset.steps))
    const graph = buildGraph(
      [...metaPrompts.values()].map(m => m.frontmatter),
      presetStepsMap,
    )

    const cycles = detectCycles(graph)
    if (cycles.length > 0) {
      displayErrors(cycles, [], output)
      if (lockAcquired) releaseLock(projectRoot)
      process.exit(1)
    }

    topologicalSort(graph)

    const stepNode = graph.nodes.get(step)
    const deps = stepNode?.dependencies ?? []
    const unmetDeps = deps.filter(dep => {
      const depStatus = state.steps[dep]?.status
      return depStatus !== 'completed' && depStatus !== 'skipped'
    })

    if (unmetDeps.length > 0) {
      output.error({
        code: 'DEP_UNMET',
        message: `Step '${step}' has unmet dependencies: ${unmetDeps.join(', ')}`,
        exitCode: 2,
        recovery: `Complete these steps first: ${unmetDeps.join(', ')}`,
      })
      if (lockAcquired) releaseLock(projectRoot)
      process.exit(2)
    }

    // -----------------------------------------------------------------------
    // Step 6: Check update mode and depth downgrade
    // -----------------------------------------------------------------------
    const cliDepth = argv.depth !== undefined ? (argv.depth as DepthLevel) : undefined
    const { depth, provenance } = resolveDepth(step, config, resolvedPreset, cliDepth)

    const updateModeResult = detectUpdateMode({ step, state, currentDepth: depth, projectRoot })

    if (updateModeResult.isUpdateMode) {
      if (!argv.force) {
        if (outputMode === 'interactive') {
          const proceed = await output.confirm(
            `Step '${step}' is already completed. Re-run in update mode?`,
            true,
          )
          if (!proceed) {
            if (lockAcquired) releaseLock(projectRoot)
            process.exit(4)
          }
        } else {
          output.info(`Re-running step '${step}' in update mode (auto)`)
        }
      }

      // Check for depth downgrade
      const hasDowngrade = updateModeResult.warnings.some(w => w.code === 'ASM_DEPTH_DOWNGRADE')
      if (hasDowngrade && !argv.force) {
        if (outputMode === 'interactive') {
          const proceedWithDowngrade = await output.confirm(
            'Depth downgrade detected. Continue?',
            false,
          )
          if (!proceedWithDowngrade) {
            if (lockAcquired) releaseLock(projectRoot)
            process.exit(4)
          }
        } else {
          for (const w of updateModeResult.warnings) {
            output.warn(w)
          }
        }
      }
    }

    // Check methodology change
    const methodologyChangeResult = detectMethodologyChange({ state, config })
    for (const w of methodologyChangeResult.warnings) {
      output.warn(w)
    }

    // -----------------------------------------------------------------------
    // Step 7: Set step to in_progress
    // -----------------------------------------------------------------------
    stateManager.setInProgress(step, 'scaffold-run')

    try {
      // Reload state after setInProgress
      state = stateManager.loadState()

      // -----------------------------------------------------------------------
      // Step 8: Load assembly components
      // -----------------------------------------------------------------------
      const { instructions } = loadInstructions(projectRoot, step, argv.instructions)

      const kbIndex = buildIndexWithOverrides(projectRoot, getPackageKnowledgeDir(projectRoot))
      const { entries: knowledgeEntries, warnings: kbWarnings } = loadEntries(
        kbIndex,
        metaPrompt.frontmatter.knowledgeBase ?? [],
      )
      for (const w of kbWarnings) {
        output.warn(w)
      }

      // Gather artifacts from completed dependency steps
      const artifacts: ArtifactEntry[] = []
      for (const dep of deps) {
        const depEntry = state.steps[dep]
        if (depEntry?.status === 'completed' && depEntry.produces) {
          for (const relPath of depEntry.produces) {
            const fullPath = path.resolve(projectRoot, relPath)
            if (fs.existsSync(fullPath)) {
              try {
                const content = fs.readFileSync(fullPath, 'utf8')
                artifacts.push({ stepName: dep, filePath: relPath, content })
              } catch {
                // skip unreadable artifacts
              }
            }
          }
        }
      }

      // Read decisions log
      const decisionsPath = path.join(projectRoot, '.scaffold', 'decisions.jsonl')
      let decisions = ''
      if (fs.existsSync(decisionsPath)) {
        try {
          decisions = fs.readFileSync(decisionsPath, 'utf8')
        } catch {
          // non-fatal
        }
      }

      // -----------------------------------------------------------------------
      // Step 9: Assemble prompt
      // -----------------------------------------------------------------------
      const engine = new AssemblyEngine()
      const assemblyResult = engine.assemble(step, {
        config,
        state,
        metaPrompt,
        knowledgeEntries,
        instructions,
        depth,
        depthProvenance: provenance,
        updateMode: updateModeResult.isUpdateMode,
        existingArtifact: updateModeResult.existingArtifact,
        artifacts,
        decisions,
      })

      if (!assemblyResult.success) {
        displayErrors(assemblyResult.errors, assemblyResult.warnings, output)
        if (lockAcquired) releaseLock(projectRoot)
        process.exit(5)
      }

      // Write assembled prompt to stdout (raw, for AI consumption)
      process.stdout.write(assemblyResult.prompt!.text)

      // -----------------------------------------------------------------------
      // Step 10: Wait for completion (interactive) or exit (auto/json)
      // -----------------------------------------------------------------------
      if (outputMode === 'auto' || outputMode === 'json') {
        // In auto/json mode: output the structured result and exit 0
        // Step stays in_progress for crash recovery awareness
        if (outputMode === 'json') {
          // Reload state for next eligible
          const stateForEligible = stateManager.loadState()
          const nextSteps = computeEligible(graph, stateForEligible.steps)
          output.result({
            step,
            status: 'completed',
            depth,
            depth_source: provenance,
            nextEligible: nextSteps,
          })
        }
        if (lockAcquired) releaseLock(projectRoot)
        process.exit(0)
      }

      // Interactive mode: prompt user for completion
      const isComplete = await output.confirm(`Step '${step}' complete?`, true)
      if (!isComplete) {
        const shouldSkip = await output.confirm('Mark as skipped instead?', false)
        if (shouldSkip) {
          stateManager.markSkipped(step, 'user-cancelled', 'scaffold-run')
        } else {
          stateManager.clearInProgress()
        }
        if (lockAcquired) releaseLock(projectRoot)
        process.exit(4)
      }

      // -----------------------------------------------------------------------
      // Step 11: Mark completed
      // -----------------------------------------------------------------------
      stateManager.markCompleted(
        step,
        metaPrompt.frontmatter.outputs ?? [],
        'scaffold-run',
        depth,
      )
      if (lockAcquired) releaseLock(projectRoot)

      // -----------------------------------------------------------------------
      // Step 12: Show next eligible steps
      // -----------------------------------------------------------------------
      const finalState = stateManager.loadState()
      const nextSteps = computeEligible(graph, finalState.steps)

      if (outputMode === 'interactive') {
        if (nextSteps.length > 0) {
          output.info(`Next eligible: ${nextSteps.join(', ')}`)
        } else {
          output.info('No more eligible steps.')
        }
      }

      process.exit(0)
    } catch (err) {
      if (lockAcquired) releaseLock(projectRoot)
      const message = err instanceof Error ? err.message : String(err)
      output.error({ code: 'RUN_UNEXPECTED_ERROR', message, exitCode: 1 })
      process.exit(1)
    }
  },
}

export default runCommand
