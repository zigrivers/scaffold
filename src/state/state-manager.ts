import type { PipelineState, StepStateEntry, InProgressRecord, DepthLevel, StepStatus } from '../types/index.js'
import type { ScaffoldError } from '../types/index.js'
import { atomicWriteFile, fileExists } from '../utils/fs.js'
import { stateMissing, stateParseError, psmAlreadyInProgress } from '../utils/errors.js'
import { migrateState } from './state-migration.js'
import { dispatchStateMigration } from './state-version-dispatch.js'
import { StatePathResolver } from './state-path-resolver.js'
import path from 'node:path'
import fs from 'node:fs'
import type { MethodologyName } from '../types/index.js'

export class StateManager {
  private statePath: string
  private pathResolver: StatePathResolver

  constructor(
    private projectRoot: string,
    private computeEligible: (steps: Record<string, StepStateEntry>) => string[],
    private configProvider?: () => { project?: { services?: unknown[] } } | undefined,
    pathResolver?: StatePathResolver,
    private globalSteps?: Set<string>,
  ) {
    this.pathResolver = pathResolver ?? new StatePathResolver(projectRoot)
    this.statePath = this.pathResolver.statePath
  }

  /** Load and validate state.json from disk. Throws ScaffoldError on schema mismatch. */
  loadState(): PipelineState {
    if (!fileExists(this.statePath)) {
      throw stateMissing(this.statePath)
    }

    let raw: string
    try {
      raw = fs.readFileSync(this.statePath, 'utf8')
    } catch (err) {
      throw stateParseError(this.statePath, (err as Error).message)
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>
    } catch (err) {
      throw stateParseError(this.statePath, (err as Error).message)
    }

    // Wave 3a: widen schema-version handling to 1 | 2 via dispatch.
    // The dispatch asserts the version is 1 or 2 (throwing otherwise) and
    // mutates raw in-place to bump v1 → v2 when the companion config has
    // services[].
    const config = this.configProvider?.()
    const ctx = { hasServices: (config?.project?.services?.length ?? 0) > 0 }
    dispatchStateMigration(parsed, ctx, this.statePath)

    // ADR-033: forward compatibility — unknown fields produce warnings (not errors) and are preserved
    const state = parsed as unknown as PipelineState

    // Apply state migrations (step renames, artifact path normalization).
    // Migrations are idempotent — safe to run on already-migrated state.
    if (migrateState(state)) {
      this.saveState(state)
    }

    // If service-scoped, merge global steps as read-only base
    if (this.pathResolver.isServiceScoped) {
      const globalStatePath = path.join(this.pathResolver.rootScaffoldDir, 'state.json')
      if (fs.existsSync(globalStatePath)) {
        const globalRaw = fs.readFileSync(globalStatePath, 'utf8')
        const globalParsed = JSON.parse(globalRaw) as Record<string, unknown>
        const globalState = globalParsed as unknown as PipelineState
        // Merge: global steps as base, service steps override
        state.steps = { ...globalState.steps, ...state.steps }
      }
    }

    return state
  }

  /** Atomically persist state to disk (write tmp + rename). */
  saveState(state: PipelineState): void {
    state.next_eligible = this.computeEligible(state.steps)
    let stateToWrite = state
    if (this.pathResolver.isServiceScoped && this.globalSteps) {
      const filteredSteps: Record<string, StepStateEntry> = {}
      for (const [name, entry] of Object.entries(state.steps)) {
        if (!this.globalSteps.has(name)) {
          filteredSteps[name] = entry
        }
      }
      stateToWrite = { ...state, steps: filteredSteps }
    }
    atomicWriteFile(this.statePath, JSON.stringify(stateToWrite, null, 2))
  }

  /** Transition step to in_progress; sets in_progress record with actor. */
  setInProgress(step: string, actor: string): void {
    const state = this.loadState()
    if (state.in_progress !== null) {
      throw psmAlreadyInProgress(step, state.in_progress.step)
    }
    // Auto-create step entry if it doesn't exist (e.g., new step added after project init)
    if (!state.steps[step]) {
      state.steps[step] = { status: 'pending', source: 'pipeline', produces: [] }
    }
    state.steps[step].status = 'in_progress'
    state.steps[step].at = new Date().toISOString()
    state.in_progress = {
      step,
      started: new Date().toISOString(),
      partial_artifacts: [],
      actor,
    }
    this.saveState(state)
  }

  /** Transition step to completed; records outputs, actor, and depth. */
  markCompleted(step: string, outputs: string[], completedBy: string, depth: DepthLevel): void {
    const state = this.loadState()
    if (!(step in state.steps)) {
      throw Object.assign(new Error(`Cannot mark unknown step '${step}' as completed`), {
        code: 'STEP_NOT_IN_STATE',
        exitCode: 1,
      })
    }
    state.steps[step].status = 'completed'
    state.steps[step].at = new Date().toISOString()
    state.steps[step].completed_by = completedBy
    state.steps[step].depth = depth
    if (outputs.length > 0) {
      state.steps[step].artifacts_verified = true
    }
    state.steps[step].produces = outputs
    state.in_progress = null
    this.saveState(state)
  }

  /** Transition step to skipped; records reason and actor. */
  markSkipped(step: string, reason: string, skippedBy: string): void {
    const state = this.loadState()
    state.steps[step].status = 'skipped'
    state.steps[step].at = new Date().toISOString()
    state.steps[step].reason = reason
    state.steps[step].completed_by = skippedBy
    state.in_progress = null
    this.saveState(state)
  }

  /** Clear the in_progress record (null out). Used by crash recovery. */
  clearInProgress(): void {
    const state = this.loadState()
    state.in_progress = null
    this.saveState(state)
  }

  /** Return the status of a single step, or undefined if step not in state. */
  getStepStatus(step: string): StepStatus | undefined {
    const state = this.loadState()
    return state.steps[step]?.status
  }

  /**
   * Reconcile state with the current pipeline definition.
   *
   * Steps that exist in the pipeline but are missing from state.steps
   * (e.g., a new step added after the project was initialized) are
   * inserted as pending. Returns true if any steps were added (and
   * the state was persisted).
   */
  reconcileWithPipeline(
    pipelineSteps: Array<{ slug: string; produces: string[]; enabled: boolean }>,
  ): boolean {
    const state = this.loadState()
    let changed = false

    for (const step of pipelineSteps) {
      // Skip global steps when service-scoped — they belong to root state
      if (this.pathResolver.isServiceScoped && this.globalSteps?.has(step.slug)) continue
      // Only add enabled steps that aren't already tracked
      if (step.enabled && !state.steps[step.slug]) {
        state.steps[step.slug] = {
          status: 'pending',
          source: 'pipeline',
          produces: step.produces,
        }
        changed = true
      }
    }

    if (changed) {
      this.saveState(state)
    }
    return changed
  }

  /**
   * Initialize a new state.json with all steps in pending status.
   * Not in the formal interface but needed by T-033 init wizard.
   */
  initializeState(options: {
    enabledSteps: Array<{ slug: string; produces: string[] }>
    scaffoldVersion: string
    methodology: string
    initMode: 'greenfield' | 'brownfield' | 'v1-migration'
    // Wave 3a: config is optional so existing callers compile unchanged.
    // When provided and project.services[] is non-empty, emit schema-version 2.
    config?: { project?: { services?: unknown[] } }
  }): void {
    this.pathResolver.ensureDir()

    const schemaVersion: 1 | 2 =
      (options.config?.project?.services?.length ?? 0) > 0 ? 2 : 1

    const state: PipelineState = {
      'schema-version': schemaVersion,
      'scaffold-version': options.scaffoldVersion,
      init_methodology: options.methodology as MethodologyName,
      config_methodology: options.methodology as MethodologyName,
      'init-mode': options.initMode,
      created: new Date().toISOString(),
      in_progress: null,
      steps: {},
      next_eligible: [],
      'extra-steps': [],
    }

    for (const step of options.enabledSteps) {
      state.steps[step.slug] = {
        status: 'pending',
        source: 'pipeline',
        produces: step.produces,
      }
    }

    this.saveState(state)
  }

  /**
   * Load state WITHOUT side effects — no saveState, no next_eligible recompute, no lock.
   * Applies dispatchStateMigration + migrateState in memory only. Use ONLY for
   * read-only inspection of foreign state (cross-reads, readiness display).
   * The returned PipelineState is a detached snapshot — mutating it does not persist.
   */
  static loadStateReadOnly(
    projectRoot: string,
    pathResolver: StatePathResolver,
    configProvider?: () => { project?: { services?: unknown[] } } | undefined,
  ): PipelineState {
    const statePath = pathResolver.statePath
    if (!fileExists(statePath)) throw stateMissing(statePath)

    const raw = fs.readFileSync(statePath, 'utf8')
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>
    } catch (err) {
      throw stateParseError(statePath, (err as Error).message)
    }

    const config = configProvider?.()
    const ctx = { hasServices: (config?.project?.services?.length ?? 0) > 0 }
    dispatchStateMigration(parsed, ctx, statePath)

    const state = parsed as unknown as PipelineState
    migrateState(state)  // in-memory only; deliberately does NOT call saveState

    if (pathResolver.isServiceScoped) {
      const globalStatePath = path.join(pathResolver.rootScaffoldDir, 'state.json')
      if (fs.existsSync(globalStatePath)) {
        const globalRaw = fs.readFileSync(globalStatePath, 'utf8')
        const globalParsed = JSON.parse(globalRaw) as Record<string, unknown>
        const globalState = globalParsed as unknown as PipelineState
        state.steps = { ...globalState.steps, ...state.steps }
      }
    }

    return state
  }
}

// Re-export ScaffoldError type for consumers
export type { ScaffoldError, InProgressRecord }
