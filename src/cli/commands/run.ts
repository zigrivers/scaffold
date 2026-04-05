import type { Argv, CommandModule } from 'yargs'
import path from 'node:path'
import fs from 'node:fs'
import { StateManager } from '../../state/state-manager.js'
import { acquireLock, releaseLock } from '../../state/lock-manager.js'
import { analyzeCrash } from '../../state/completion.js'
import { AssemblyEngine } from '../../core/assembly/engine.js'
import { getPackageKnowledgeDir } from '../../utils/fs.js'
import { buildIndexWithOverrides, loadEntries } from '../../core/assembly/knowledge-loader.js'
import { loadInstructions } from '../../core/assembly/instruction-loader.js'
import { resolveDepth } from '../../core/assembly/depth-resolver.js'
import { detectUpdateMode } from '../../core/assembly/update-mode.js'
import { detectMethodologyChange } from '../../core/assembly/methodology-change.js'
import { detectCycles, topologicalSort } from '../../core/dependency/dependency.js'
import { loadPipelineContext } from '../../core/pipeline/context.js'
import { resolvePipeline } from '../../core/pipeline/resolver.js'
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

    // -----------------------------------------------------------------------
    // Step 2: Load pipeline context and resolve overlay/graph
    // -----------------------------------------------------------------------
    const context = loadPipelineContext(projectRoot, { includeTools: true })
    if (!context.config) {
      for (const err of context.configErrors) output.error(err.message)
      process.exit(1)
      return
    }
    const pipeline = resolvePipeline(context, { output })

    const metaPrompt = context.metaPrompts.get(step)
    if (!metaPrompt) {
      const candidates = [...context.metaPrompts.keys()]
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

    const stateManager = new StateManager(projectRoot, pipeline.computeEligible)
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
    const { graph } = pipeline

    const cycles = detectCycles(graph)
    if (cycles.length > 0) {
      displayErrors(cycles, [], output)
      if (lockAcquired) releaseLock(projectRoot)
      process.exit(1)
    }

    topologicalSort(graph)

    // Tools (category: 'tool') are not in the dependency graph — skip dep checking
    const isTool = metaPrompt.frontmatter.category === 'tool'
    const stepNode = isTool ? undefined : graph.nodes.get(step)
    const deps = pipeline.overlay.dependencies[step] ?? stepNode?.dependencies ?? metaPrompt.frontmatter.dependencies ?? []

    if (!isTool) {
      const unmetDeps = deps.filter(dep => {
        // Overlay-disabled deps are treated as satisfied (matches eligibility.ts)
        const depNode = graph?.nodes.get(dep)
        if (depNode && !depNode.enabled) return false
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
    }

    // -----------------------------------------------------------------------
    // Step 6: Check update mode and depth downgrade
    // -----------------------------------------------------------------------
    const cliDepth = argv.depth !== undefined ? (argv.depth as DepthLevel) : undefined
    const { depth, provenance } = resolveDepth(step, context.config, pipeline.preset, cliDepth)

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
    const methodologyChangeResult = detectMethodologyChange({ state, config: context.config })
    for (const w of methodologyChangeResult.warnings) {
      output.warn(w)
    }

    // -----------------------------------------------------------------------
    // Step 7: Set step to in_progress (skip for stateless steps)
    // -----------------------------------------------------------------------
    const isStateless = metaPrompt.frontmatter.stateless === true
    if (!isStateless) {
      stateManager.setInProgress(step, 'scaffold-run')
    }

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
        pipeline.overlay.knowledge[step] ?? metaPrompt.frontmatter.knowledgeBase ?? [],
      )
      for (const w of kbWarnings) {
        output.warn(w)
      }

      // Gather artifacts from completed dependency steps
      const artifacts: ArtifactEntry[] = []
      const gatheredPaths = new Set<string>()
      for (const dep of deps) {
        const depEntry = state.steps[dep]
        if (depEntry?.status === 'completed' && depEntry.produces) {
          for (const relPath of depEntry.produces) {
            const fullPath = path.resolve(projectRoot, relPath)
            if (fs.existsSync(fullPath)) {
              try {
                const content = fs.readFileSync(fullPath, 'utf8')
                artifacts.push({ stepName: dep, filePath: relPath, content })
                gatheredPaths.add(relPath)
              } catch (err) {
                output.warn({
                  code: 'ARTIFACT_READ_ERROR',
                  message: `Could not read artifact '${relPath}' from step '${dep}': ${(err as Error).message}`,
                })
              }
            }
          }
        }
      }

      // Gather artifacts from reads (optional cross-cutting references)
      // Note: graph defaults missing steps to enabled:true, which may not reflect
      // custom config overrides. This is a pre-existing graph builder limitation.
      const reads = pipeline.overlay.reads[step] ?? metaPrompt.frontmatter.reads ?? []
      for (const readStep of reads) {
        // Check dependency graph for enablement (overlay-disabled steps)
        const readNode = graph?.nodes.get(readStep)
        if (readNode && !readNode.enabled) continue

        // Check state — silently skip if not completed (reads are optional)
        const readEntry = state.steps[readStep]
        if (readEntry?.status !== 'completed' || !readEntry.produces) continue

        for (const relPath of readEntry.produces) {
          // Deduplicate: skip paths already gathered from deps
          if (gatheredPaths.has(relPath)) continue

          const fullPath = path.resolve(projectRoot, relPath)
          if (fs.existsSync(fullPath)) {
            try {
              const content = fs.readFileSync(fullPath, 'utf8')
              artifacts.push({ stepName: readStep, filePath: relPath, content })
              gatheredPaths.add(relPath)
            } catch (err) {
              output.warn({
                code: 'ARTIFACT_READ_ERROR',
                message: `Could not read artifact '${relPath}' from step '${readStep}': ${(err as Error).message}`,
              })
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
        } catch (err) {
          output.warn({
            code: 'DECISIONS_READ_ERROR',
            message: `Could not read decisions log: ${(err as Error).message}`,
          })
        }
      }

      // -----------------------------------------------------------------------
      // Step 9: Assemble prompt
      // -----------------------------------------------------------------------
      const engine = new AssemblyEngine()
      const assemblyResult = engine.assemble(step, {
        config: context.config,
        state,
        metaPrompt,
        knowledgeEntries,
        instructions,
        arguments: argv.instructions,
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

      // -----------------------------------------------------------------------
      // Step 10: Wait for completion (interactive) or exit (auto/json)
      // -----------------------------------------------------------------------
      if (outputMode === 'auto' || outputMode === 'json') {
        // In auto/json mode: output the structured result and exit 0
        // For stateful steps, step stays in_progress for crash recovery awareness
        if (outputMode === 'json') {
          if (isStateless) {
            output.result({
              step,
              status: 'stateless',
              depth,
              depth_source: provenance,
              prompt: assemblyResult.prompt!.text,
            })
          } else {
            // Reload state for next eligible
            const stateForEligible = stateManager.loadState()
            const nextSteps = pipeline.computeEligible(stateForEligible.steps)
            output.result({
              step,
              status: 'in_progress',
              depth,
              depth_source: provenance,
              nextEligible: nextSteps,
              prompt: assemblyResult.prompt!.text,
            })
          }
        } else {
          // auto mode: write prompt to stdout for AI consumption
          process.stdout.write(assemblyResult.prompt!.text)
        }
        if (lockAcquired) releaseLock(projectRoot)
        process.exit(0)
      }

      // Write assembled prompt to stdout (raw, for AI consumption in interactive mode)
      process.stdout.write(assemblyResult.prompt!.text)

      // Interactive mode: prompt user for completion
      if (isStateless) {
        // Stateless steps don't track completion — just release lock and exit
        if (lockAcquired) releaseLock(projectRoot)
        if (outputMode === 'interactive') {
          output.info(`Stateless step '${step}' executed. Available for re-use anytime.`)
        }
        process.exit(0)
        return
      }

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
      const nextSteps = pipeline.computeEligible(finalState.steps)

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
