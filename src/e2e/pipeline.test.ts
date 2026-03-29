/**
 * E2E tests for pipeline state operations — exercises StateManager, LockManager,
 * DecisionLogger, AssemblyEngine, and completion detection against real temp dirs.
 *
 * No mocking of modules under test. Only output/UI helpers are mocked.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { StateManager } from '../state/state-manager.js'
import { acquireLock, releaseLock } from '../state/lock-manager.js'
import { appendDecision, readDecisions } from '../state/decision-logger.js'
import { detectCompletion } from '../state/completion.js'
import { AssemblyEngine } from '../core/assembly/engine.js'
import type { PipelineState, MetaPromptFile } from '../types/index.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-e2e-pipeline-'))
}

/** Write a minimal valid state.json directly to tmpDir/.scaffold/state.json */
function writeMinimalState(
  projectRoot: string,
  overrides: Partial<PipelineState> = {},
): void {
  const scaffoldDir = path.join(projectRoot, '.scaffold')
  fs.mkdirSync(scaffoldDir, { recursive: true })

  const state: PipelineState = {
    'schema-version': 1,
    'scaffold-version': '2.0.0',
    init_methodology: 'mvp',
    config_methodology: 'mvp',
    'init-mode': 'greenfield',
    created: new Date().toISOString(),
    in_progress: null,
    steps: {
      'test-step': {
        status: 'pending',
        source: 'pipeline',
        produces: [],
      },
    },
    next_eligible: [],
    'extra-steps': [],
    ...overrides,
  }

  fs.writeFileSync(
    path.join(scaffoldDir, 'state.json'),
    JSON.stringify(state, null, 2),
    'utf8',
  )
}

/** Build a minimal MetaPromptFile suitable for AssemblyEngine.assemble() */
function makeMinimalMetaPrompt(name = 'test-step'): MetaPromptFile {
  return {
    stepName: name,
    filePath: `/fake/pipeline/${name}.md`,
    frontmatter: {
      name,
      description: 'A test step',
      phase: 'pre',
      order: 1,
      dependencies: [],
      outputs: [],
      conditional: null,
      knowledgeBase: [],
      reads: [],
      stateless: false,
      category: 'pipeline' as const,
    },
    body: '## Purpose\n\nTest body content.',
    sections: {
      Purpose: 'Test body content.',
    },
  }
}

/** Build a minimal ScaffoldConfig */
function makeMinimalConfig() {
  return {
    version: 2 as const,
    methodology: 'mvp' as const,
    platforms: ['claude-code' as const],
    project: { traits: [] },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('pipeline state E2E', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTempDir()
  })

  afterEach(() => {
    // Release any stale lock before cleanup
    try { releaseLock(tmpDir) } catch { /* ignore */ }
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  // Test 1: Step lifecycle: pending → in_progress → completed
  it('step lifecycle: pending → in_progress → completed', () => {
    writeMinimalState(tmpDir)
    const stateManager = new StateManager(tmpDir, () => [])

    // Verify initial state
    expect(stateManager.getStepStatus('test-step')).toBe('pending')

    // Transition to in_progress
    stateManager.setInProgress('test-step', 'e2e-test')
    expect(stateManager.getStepStatus('test-step')).toBe('in_progress')

    // State persists to disk — verify via fresh load
    const midState = stateManager.loadState()
    expect(midState.in_progress).not.toBeNull()
    expect(midState.in_progress!.step).toBe('test-step')
    expect(midState.in_progress!.actor).toBe('e2e-test')

    // Transition to completed
    stateManager.markCompleted('test-step', ['docs/output.md'], 'e2e-test', 3)
    expect(stateManager.getStepStatus('test-step')).toBe('completed')

    // in_progress cleared after completion
    const finalState = stateManager.loadState()
    expect(finalState.in_progress).toBeNull()
    expect(finalState.steps['test-step']?.completed_by).toBe('e2e-test')
    expect(finalState.steps['test-step']?.depth).toBe(3)
    expect(finalState.steps['test-step']?.artifacts_verified).toBe(true)
  })

  // Test 2: markSkipped transitions step to skipped status
  it('skip marks step as skipped and records reason', () => {
    writeMinimalState(tmpDir)
    const stateManager = new StateManager(tmpDir, () => [])

    stateManager.markSkipped('test-step', 'not needed for MVP', 'e2e-test')

    expect(stateManager.getStepStatus('test-step')).toBe('skipped')
    const state = stateManager.loadState()
    expect(state.steps['test-step']?.reason).toBe('not needed for MVP')
    expect(state.steps['test-step']?.completed_by).toBe('e2e-test')
    expect(state.in_progress).toBeNull()
  })

  // Test 3: State transitions persist to disk correctly
  it('state persists atomically across StateManager instances', () => {
    writeMinimalState(tmpDir)
    const sm1 = new StateManager(tmpDir, () => [])
    sm1.setInProgress('test-step', 'actor-1')

    // Create a second independent instance and read the state
    const sm2 = new StateManager(tmpDir, () => [])
    const state = sm2.loadState()
    expect(state.in_progress?.step).toBe('test-step')
    expect(state.in_progress?.actor).toBe('actor-1')
  })

  // Test 4: clearInProgress nulls the in_progress record
  it('clearInProgress nulls in_progress without completing the step', () => {
    writeMinimalState(tmpDir)
    const stateManager = new StateManager(tmpDir, () => [])
    stateManager.setInProgress('test-step', 'e2e-test')

    stateManager.clearInProgress()

    const state = stateManager.loadState()
    expect(state.in_progress).toBeNull()
    // Step status should remain in_progress (clearInProgress doesn't change step status)
    expect(state.steps['test-step']?.status).toBe('in_progress')
  })

  // Test 5: Decision logger appends entries and reads them back
  it('decision logger appends entries correctly and supports round-trip read', () => {
    // appendDecision creates the dir/file if needed
    const id1 = appendDecision(tmpDir, {
      prompt: 'test-step',
      decision: 'Use TypeScript strict mode',
      at: new Date().toISOString(),
      completed_by: 'e2e-test',
      step_completed: false,
    })

    const id2 = appendDecision(tmpDir, {
      prompt: 'test-step',
      decision: 'Use vitest over jest',
      at: new Date().toISOString(),
      completed_by: 'e2e-test',
      step_completed: false,
    })

    // IDs should be sequential
    expect(id1).toBe('D-001')
    expect(id2).toBe('D-002')

    // Read back and verify
    const entries = readDecisions(tmpDir)
    expect(entries).toHaveLength(2)
    expect(entries[0]?.id).toBe('D-001')
    expect(entries[0]?.decision).toBe('Use TypeScript strict mode')
    expect(entries[1]?.id).toBe('D-002')
    expect(entries[1]?.decision).toBe('Use vitest over jest')
  })

  // Test 6: Decision logger filter by step
  it('decision logger filters entries by step slug', () => {
    appendDecision(tmpDir, {
      prompt: 'step-a',
      decision: 'Decision for step A',
      at: new Date().toISOString(),
      completed_by: 'e2e-test',
      step_completed: false,
    })
    appendDecision(tmpDir, {
      prompt: 'step-b',
      decision: 'Decision for step B',
      at: new Date().toISOString(),
      completed_by: 'e2e-test',
      step_completed: false,
    })

    const stepAEntries = readDecisions(tmpDir, { step: 'step-a' })
    expect(stepAEntries).toHaveLength(1)
    expect(stepAEntries[0]?.decision).toBe('Decision for step A')
  })

  // Test 7: Lock manager prevents concurrent access
  it('lock manager prevents double acquisition', () => {
    const scaffoldDir = path.join(tmpDir, '.scaffold')
    fs.mkdirSync(scaffoldDir, { recursive: true })

    const first = acquireLock(tmpDir, 'run', 'test-step')
    expect(first.acquired).toBe(true)

    // Second acquisition in same process should fail (same PID, not stale)
    // but acquireLock checks for existing lock file existence, not PID match
    // A second call will find the lock file and try to check staleness
    const second = acquireLock(tmpDir, 'run', 'test-step')
    // The lock should not be acquired again (file already exists)
    // This will be acquired: false OR race detected
    expect(second.acquired).toBe(false)

    releaseLock(tmpDir)
  })

  // Test 8: Lock manager release deletes lock file
  it('lock release deletes the lock file', () => {
    const scaffoldDir = path.join(tmpDir, '.scaffold')
    fs.mkdirSync(scaffoldDir, { recursive: true })

    acquireLock(tmpDir, 'run', 'test-step')
    expect(fs.existsSync(path.join(scaffoldDir, 'lock.json'))).toBe(true)

    releaseLock(tmpDir)
    expect(fs.existsSync(path.join(scaffoldDir, 'lock.json'))).toBe(false)
  })

  // Test 9: Assembly engine produces 7-section prompt
  it('assembly engine produces a prompt with 7 sections', () => {
    writeMinimalState(tmpDir)
    const stateManager = new StateManager(tmpDir, () => [])
    const state = stateManager.loadState()
    const metaPrompt = makeMinimalMetaPrompt()
    const config = makeMinimalConfig()

    const engine = new AssemblyEngine()
    const result = engine.assemble('test-step', {
      config,
      state,
      metaPrompt,
      knowledgeEntries: [],
      instructions: { global: null, perStep: null, inline: null },
      depth: 3,
      depthProvenance: 'preset-default',
      updateMode: false,
    })

    expect(result.success).toBe(true)
    expect(result.prompt).toBeDefined()
    expect(result.prompt!.sections).toHaveLength(7)

    const headings = result.prompt!.sections.map(s => s.heading)
    expect(headings).toEqual([
      'System',
      'Meta-Prompt',
      'Knowledge Base',
      'Project Context',
      'Methodology',
      'Instructions',
      'Execution',
    ])
  })

  // Test 10: detectCompletion finds real files on disk
  it('detectCompletion finds real artifact files on disk', () => {
    writeMinimalState(tmpDir, {
      steps: {
        'test-step': {
          status: 'completed',
          source: 'pipeline',
          produces: ['docs/prd.md'],
        },
      },
    })

    // Create the expected artifact
    fs.mkdirSync(path.join(tmpDir, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'docs', 'prd.md'), '# PRD\n\nContent', 'utf8')

    const stateManager = new StateManager(tmpDir, () => [])
    const state = stateManager.loadState()

    const result = detectCompletion('test-step', state, ['docs/prd.md'], tmpDir)
    expect(result.complete).toBe(true)
    expect(result.artifactsPresent).toContain('docs/prd.md')
    expect(result.artifactsMissing).toHaveLength(0)
  })

  // Test 11: detectCompletion detects missing artifacts
  it('detectCompletion detects missing artifact files', () => {
    writeMinimalState(tmpDir, {
      steps: {
        'test-step': {
          status: 'in_progress',
          source: 'pipeline',
          produces: ['docs/prd.md'],
        },
      },
    })

    const stateManager = new StateManager(tmpDir, () => [])
    const state = stateManager.loadState()

    const result = detectCompletion('test-step', state, ['docs/prd.md'], tmpDir)
    expect(result.complete).toBe(false)
    expect(result.artifactsMissing).toContain('docs/prd.md')
    expect(result.artifactsPresent).toHaveLength(0)
  })
})
