/**
 * E2E tests for the scaffold rework command.
 * Exercises the full rework lifecycle against real temporary directories.
 */

import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { ReworkManager } from '../state/rework-manager.js'
import { StateManager } from '../state/state-manager.js'
import { parsePhases, parseThrough, applyExclusions, resolveStepsForPhases } from '../core/rework/phase-selector.js'
import { buildGraph } from '../core/dependency/graph.js'
import type { MetaPromptFrontmatter } from '../types/index.js'
import type { PipelineState, StepStatus } from '../types/index.js'
import type { ReworkConfig, ReworkStep } from '../types/index.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const tmpDirs: string[] = []

function makeTempDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-e2e-rework-'))
  fs.mkdirSync(path.join(d, '.scaffold'), { recursive: true })
  tmpDirs.push(d)
  return d
}

afterEach(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  tmpDirs.length = 0
})

function makeState(steps: Record<string, { status: StepStatus; produces?: string[] }>): PipelineState {
  return {
    'schema-version': 1,
    'scaffold-version': '2.30.0',
    init_methodology: 'deep',
    config_methodology: 'deep',
    'init-mode': 'greenfield',
    created: '2026-01-01T00:00:00Z',
    in_progress: null,
    steps: Object.fromEntries(
      Object.entries(steps).map(([k, v]) => [k, {
        status: v.status,
        source: 'pipeline' as const,
        produces: v.produces ?? [],
      }]),
    ),
    next_eligible: [],
    'extra-steps': [],
  }
}

const BASE: MetaPromptFrontmatter = {
  name: '', description: '', phase: 'pre', order: 0,
  dependencies: [], outputs: [], conditional: null,
  knowledgeBase: [], reads: [],
}
const SAMPLE_PROMPTS: MetaPromptFrontmatter[] = [
  { ...BASE, name: 'create-prd', description: 'Create PRD', order: 110, outputs: ['docs/plan.md'] },
  { ...BASE, name: 'review-prd', description: 'Review PRD', order: 120, dependencies: ['create-prd'] },
  {
    ...BASE, name: 'tech-stack', description: 'Tech stack',
    phase: 'foundation', order: 210, outputs: ['docs/tech-stack.md'],
  },
  {
    ...BASE, name: 'coding-standards', description: 'Coding standards',
    phase: 'foundation', order: 220, dependencies: ['tech-stack'],
    outputs: ['docs/coding-standards.md'],
  },
  {
    ...BASE, name: 'beads', description: 'Optional beads',
    phase: 'foundation', order: 200, conditional: 'if-needed',
  },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Rework E2E: Full Lifecycle', () => {
  it('creates session, advances steps, and completes', () => {
    const dir = makeTempDir()
    const reworkManager = new ReworkManager(dir)

    const config: ReworkConfig = {
      phases: [1],
      depth: null,
      fix: true,
      fresh: false,
      auto: false,
    }
    const steps: ReworkStep[] = [
      { name: 'create-prd', phase: 1, status: 'pending', completed_at: null, error: null },
      { name: 'review-prd', phase: 1, status: 'pending', completed_at: null, error: null },
    ]

    // Create
    reworkManager.createSession(config, steps)
    expect(reworkManager.hasSession()).toBe(true)

    // Start + advance first step
    reworkManager.startStep('create-prd')
    let session = reworkManager.loadSession()
    expect(session.current_step).toBe('create-prd')

    reworkManager.advanceStep('create-prd')
    session = reworkManager.loadSession()
    expect(session.stats.completed).toBe(1)

    // Start + advance second step
    reworkManager.startStep('review-prd')
    reworkManager.advanceStep('review-prd')
    session = reworkManager.loadSession()
    expect(session.stats.completed).toBe(2)

    // All done
    expect(reworkManager.nextStep()).toBeNull()

    // Clear
    reworkManager.clearSession()
    expect(reworkManager.hasSession()).toBe(false)
  })

  it('resume picks up from first non-completed step', () => {
    const dir = makeTempDir()
    const reworkManager = new ReworkManager(dir)

    const config: ReworkConfig = {
      phases: [1],
      depth: 4,
      fix: true,
      fresh: false,
      auto: true,
    }
    const steps: ReworkStep[] = [
      { name: 'create-prd', phase: 1, status: 'pending', completed_at: null, error: null },
      { name: 'review-prd', phase: 1, status: 'pending', completed_at: null, error: null },
    ]

    reworkManager.createSession(config, steps)
    reworkManager.startStep('create-prd')
    reworkManager.advanceStep('create-prd')

    // "Resume" - find next pending step
    const next = reworkManager.nextStep()
    expect(next).not.toBeNull()
    expect(next!.name).toBe('review-prd')
  })
})

describe('Rework E2E: Phase Resolution with Real Graph', () => {
  it('resolves steps for phase 1 in correct topological order', () => {
    const state = makeState({
      'create-prd': { status: 'completed' },
      'review-prd': { status: 'completed' },
      'tech-stack': { status: 'completed' },
      'coding-standards': { status: 'completed' },
      'beads': { status: 'completed' },
    })

    const presetSteps = new Map(SAMPLE_PROMPTS.map(m => [m.name, { enabled: true }]))
    const graph = buildGraph(SAMPLE_PROMPTS, presetSteps)
    const steps = resolveStepsForPhases([1], SAMPLE_PROMPTS, state, graph)

    expect(steps).toHaveLength(2)
    expect(steps[0].name).toBe('create-prd')
    expect(steps[1].name).toBe('review-prd')
    // review-prd depends on create-prd, so create-prd must come first
  })

  it('resolves steps for phases 1-2, excluding skipped conditionals', () => {
    const state = makeState({
      'create-prd': { status: 'completed' },
      'review-prd': { status: 'completed' },
      'tech-stack': { status: 'completed' },
      'coding-standards': { status: 'completed' },
      'beads': { status: 'skipped' },
    })

    const presetSteps = new Map(SAMPLE_PROMPTS.map(m => [m.name, { enabled: true }]))
    const graph = buildGraph(SAMPLE_PROMPTS, presetSteps)
    const steps = resolveStepsForPhases([1, 2], SAMPLE_PROMPTS, state, graph)

    // beads is conditional + skipped → excluded
    const names = steps.map(s => s.name)
    expect(names).not.toContain('beads')
    expect(names).toContain('create-prd')
    expect(names).toContain('tech-stack')
    expect(names).toContain('coding-standards')
  })

  it('--through 2 --exclude 1 gives only phase 2 steps', () => {
    const phases = applyExclusions(parseThrough(2), parsePhases('1'))
    expect(phases).toEqual([2])

    const state = makeState({
      'create-prd': { status: 'completed' },
      'review-prd': { status: 'completed' },
      'tech-stack': { status: 'completed' },
      'coding-standards': { status: 'completed' },
      'beads': { status: 'completed' },
    })

    const presetSteps = new Map(SAMPLE_PROMPTS.map(m => [m.name, { enabled: true }]))
    const graph = buildGraph(SAMPLE_PROMPTS, presetSteps)
    const steps = resolveStepsForPhases(phases, SAMPLE_PROMPTS, state, graph)

    const stepPhases = new Set(steps.map(s => s.phase))
    expect(stepPhases).toEqual(new Set([2]))
  })
})

describe('Rework E2E: State Integration', () => {
  it('batch-resets steps in state.json', () => {
    const dir = makeTempDir()
    const computeEligible = () => [] as string[]
    const stateManager = new StateManager(dir, computeEligible)

    stateManager.initializeState({
      enabledSteps: [
        { slug: 'create-prd', produces: ['docs/plan.md'] },
        { slug: 'review-prd', produces: [] },
        { slug: 'tech-stack', produces: ['docs/tech-stack.md'] },
      ],
      scaffoldVersion: '2.30.0',
      methodology: 'deep',
      initMode: 'greenfield',
    })

    // Mark steps as completed
    stateManager.setInProgress('create-prd', 'test')
    stateManager.markCompleted('create-prd', ['docs/plan.md'], 'test', 3)
    stateManager.setInProgress('review-prd', 'test')
    stateManager.markCompleted('review-prd', [], 'test', 3)

    let state = stateManager.loadState()
    expect(state.steps['create-prd'].status).toBe('completed')
    expect(state.steps['review-prd'].status).toBe('completed')

    // Batch reset (simulating what rework command does)
    const stepsToReset = ['create-prd', 'review-prd']
    for (const step of stepsToReset) {
      state.steps[step].status = 'pending'
      delete state.steps[step].at
      delete state.steps[step].completed_by
      delete state.steps[step].depth
    }
    stateManager.saveState(state)

    // Verify reset
    state = stateManager.loadState()
    expect(state.steps['create-prd'].status).toBe('pending')
    expect(state.steps['review-prd'].status).toBe('pending')
    expect(state.steps['tech-stack'].status).toBe('pending') // untouched
  })
})
