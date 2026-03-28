import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, afterEach } from 'vitest'
import { StateManager } from './state-manager.js'

const tmpDirs: string[] = []

function makeTempDir(): string {
  const dir = path.join(os.tmpdir(), `scaffold-sm-test-${crypto.randomUUID()}`)
  fs.mkdirSync(dir, { recursive: true })
  fs.mkdirSync(path.join(dir, '.scaffold'), { recursive: true })
  tmpDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  tmpDirs.length = 0
})

const computeEligible = () => []

const ENABLED_STEPS = [
  { slug: 'create-prd', produces: ['docs/prd.md'] },
  { slug: 'create-architecture', produces: ['docs/architecture.md'] },
]

const INIT_OPTIONS = {
  enabledSteps: ENABLED_STEPS,
  scaffoldVersion: '2.0.0',
  methodology: 'deep',
  initMode: 'greenfield' as const,
}

describe('StateManager', () => {
  describe('initializeState', () => {
    it('creates valid state.json with all steps pending, schema-version 1', () => {
      const tempDir = makeTempDir()
      const manager = new StateManager(tempDir, computeEligible)
      manager.initializeState(INIT_OPTIONS)

      const statePath = path.join(tempDir, '.scaffold', 'state.json')
      expect(fs.existsSync(statePath)).toBe(true)

      const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'))
      expect(raw['schema-version']).toBe(1)
      expect(raw.steps['create-prd'].status).toBe('pending')
      expect(raw.steps['create-architecture'].status).toBe('pending')
    })

    it('populates all 10 required top-level fields per state-json-schema.md', () => {
      const tempDir = makeTempDir()
      const manager = new StateManager(tempDir, computeEligible)
      manager.initializeState(INIT_OPTIONS)

      const statePath = path.join(tempDir, '.scaffold', 'state.json')
      const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'))

      expect(raw).toHaveProperty('schema-version')
      expect(raw).toHaveProperty('scaffold-version')
      expect(raw).toHaveProperty('init_methodology')
      expect(raw).toHaveProperty('config_methodology')
      expect(raw).toHaveProperty('init-mode')
      expect(raw).toHaveProperty('created')
      expect(raw).toHaveProperty('in_progress')
      expect(raw).toHaveProperty('steps')
      expect(raw).toHaveProperty('next_eligible')
      expect(raw).toHaveProperty('extra-steps')
    })
  })

  describe('loadState', () => {
    it('loads existing state.json successfully', () => {
      const tempDir = makeTempDir()
      const manager = new StateManager(tempDir, computeEligible)
      manager.initializeState(INIT_OPTIONS)

      const state = manager.loadState()
      expect(state['schema-version']).toBe(1)
      expect(state['scaffold-version']).toBe('2.0.0')
      expect(state.steps['create-prd'].status).toBe('pending')
    })

    it('throws STATE_MISSING when file not found', () => {
      const tempDir = makeTempDir()
      const manager = new StateManager(tempDir, computeEligible)

      expect(() => manager.loadState()).toThrow()
      try {
        manager.loadState()
      } catch (err) {
        expect((err as { code: string }).code).toBe('STATE_MISSING')
      }
    })

    it('throws STATE_PARSE_ERROR on invalid JSON', () => {
      const tempDir = makeTempDir()
      const manager = new StateManager(tempDir, computeEligible)
      const statePath = path.join(tempDir, '.scaffold', 'state.json')
      fs.writeFileSync(statePath, '{ invalid json }', 'utf8')

      expect(() => manager.loadState()).toThrow()
      try {
        manager.loadState()
      } catch (err) {
        expect((err as { code: string }).code).toBe('STATE_PARSE_ERROR')
      }
    })

    it('throws STATE_SCHEMA_VERSION on schema-version mismatch', () => {
      const tempDir = makeTempDir()
      const manager = new StateManager(tempDir, computeEligible)
      const statePath = path.join(tempDir, '.scaffold', 'state.json')
      const badState = {
        'schema-version': 99,
        'scaffold-version': '2.0.0',
        init_methodology: 'deep',
        config_methodology: 'deep',
        'init-mode': 'greenfield',
        created: new Date().toISOString(),
        in_progress: null,
        steps: {},
        next_eligible: [],
        'extra-steps': [],
      }
      fs.writeFileSync(statePath, JSON.stringify(badState, null, 2), 'utf8')

      expect(() => manager.loadState()).toThrow()
      try {
        manager.loadState()
      } catch (err) {
        expect((err as { code: string }).code).toBe('STATE_SCHEMA_VERSION')
      }
    })
  })

  describe('setInProgress', () => {
    it('sets step to in_progress and populates in_progress record', () => {
      const tempDir = makeTempDir()
      const manager = new StateManager(tempDir, computeEligible)
      manager.initializeState(INIT_OPTIONS)

      manager.setInProgress('create-prd', 'agent-1')

      const state = manager.loadState()
      expect(state.steps['create-prd'].status).toBe('in_progress')
      expect(state.in_progress).not.toBeNull()
      expect(state.in_progress?.step).toBe('create-prd')
      expect(state.in_progress?.actor).toBe('agent-1')
      expect(state.in_progress?.partial_artifacts).toEqual([])
      expect(typeof state.in_progress?.started).toBe('string')
    })

    it('throws PSM_ALREADY_IN_PROGRESS when in_progress is non-null', () => {
      const tempDir = makeTempDir()
      const manager = new StateManager(tempDir, computeEligible)
      manager.initializeState(INIT_OPTIONS)

      manager.setInProgress('create-prd', 'agent-1')

      expect(() => manager.setInProgress('create-architecture', 'agent-2')).toThrow()
      try {
        manager.setInProgress('create-architecture', 'agent-2')
      } catch (err) {
        expect((err as { code: string }).code).toBe('PSM_ALREADY_IN_PROGRESS')
      }
    })

    it('auto-creates step entry when step is not in state', () => {
      const tempDir = makeTempDir()
      const manager = new StateManager(tempDir, computeEligible)
      manager.initializeState(INIT_OPTIONS)

      // 'ai-memory-setup' is not in ENABLED_STEPS / state
      manager.setInProgress('ai-memory-setup', 'agent-1')

      const state = manager.loadState()
      expect(state.steps['ai-memory-setup']).toBeDefined()
      expect(state.steps['ai-memory-setup'].status).toBe('in_progress')
      expect(state.in_progress?.step).toBe('ai-memory-setup')
    })

    it('only one step can be in_progress at a time', () => {
      const tempDir = makeTempDir()
      const manager = new StateManager(tempDir, computeEligible)
      manager.initializeState(INIT_OPTIONS)

      manager.setInProgress('create-prd', 'agent-1')
      const state = manager.loadState()

      // Only create-prd is in_progress; create-architecture is still pending
      expect(state.steps['create-prd'].status).toBe('in_progress')
      expect(state.steps['create-architecture'].status).toBe('pending')
      expect(state.in_progress?.step).toBe('create-prd')
    })
  })

  describe('markCompleted', () => {
    it('sets status to completed, records timestamp and outputs, clears in_progress', () => {
      const tempDir = makeTempDir()
      const manager = new StateManager(tempDir, computeEligible)
      manager.initializeState(INIT_OPTIONS)

      manager.setInProgress('create-prd', 'agent-1')
      manager.markCompleted('create-prd', ['docs/prd.md'], 'agent-1', 3)

      const state = manager.loadState()
      expect(state.steps['create-prd'].status).toBe('completed')
      // State migration normalizes docs/prd.md → docs/plan.md on load
      expect(state.steps['create-prd'].produces).toEqual(['docs/plan.md'])
      expect(state.steps['create-prd'].artifacts_verified).toBe(true)
      expect(typeof state.steps['create-prd'].at).toBe('string')
      expect(state.in_progress).toBeNull()
    })

    it('records completed_by and depth fields', () => {
      const tempDir = makeTempDir()
      const manager = new StateManager(tempDir, computeEligible)
      manager.initializeState(INIT_OPTIONS)

      manager.setInProgress('create-prd', 'agent-1')
      manager.markCompleted('create-prd', ['docs/prd.md'], 'agent-1', 4)

      const state = manager.loadState()
      expect(state.steps['create-prd'].completed_by).toBe('agent-1')
      expect(state.steps['create-prd'].depth).toBe(4)
    })
  })

  describe('markSkipped', () => {
    it('sets status to skipped with reason and timestamp', () => {
      const tempDir = makeTempDir()
      const manager = new StateManager(tempDir, computeEligible)
      manager.initializeState(INIT_OPTIONS)

      manager.setInProgress('create-prd', 'agent-1')
      manager.markSkipped('create-prd', 'not needed for MVP', 'agent-1')

      const state = manager.loadState()
      expect(state.steps['create-prd'].status).toBe('skipped')
      expect(state.steps['create-prd'].reason).toBe('not needed for MVP')
      expect(state.steps['create-prd'].completed_by).toBe('agent-1')
      expect(typeof state.steps['create-prd'].at).toBe('string')
      expect(state.in_progress).toBeNull()
    })
  })

  describe('clearInProgress', () => {
    it('sets in_progress to null', () => {
      const tempDir = makeTempDir()
      const manager = new StateManager(tempDir, computeEligible)
      manager.initializeState(INIT_OPTIONS)

      manager.setInProgress('create-prd', 'agent-1')
      manager.clearInProgress()

      const state = manager.loadState()
      expect(state.in_progress).toBeNull()
    })
  })

  describe('getStepStatus', () => {
    it('returns status of a step', () => {
      const tempDir = makeTempDir()
      const manager = new StateManager(tempDir, computeEligible)
      manager.initializeState(INIT_OPTIONS)

      expect(manager.getStepStatus('create-prd')).toBe('pending')
    })

    it('returns undefined for unknown step', () => {
      const tempDir = makeTempDir()
      const manager = new StateManager(tempDir, computeEligible)
      manager.initializeState(INIT_OPTIONS)

      expect(manager.getStepStatus('non-existent-step')).toBeUndefined()
    })
  })

  describe('reconcileWithPipeline', () => {
    it('adds new pipeline steps missing from state as pending', () => {
      const tempDir = makeTempDir()
      const manager = new StateManager(tempDir, computeEligible)
      manager.initializeState(INIT_OPTIONS)

      // Simulate a new step added to the pipeline after project init
      const pipelineSteps = [
        { slug: 'create-prd', produces: ['docs/prd.md'], enabled: true },
        { slug: 'create-architecture', produces: ['docs/architecture.md'], enabled: true },
        { slug: 'story-tests', produces: ['tests/acceptance/', 'docs/story-tests-map.md'], enabled: true },
      ]

      const changed = manager.reconcileWithPipeline(pipelineSteps)
      expect(changed).toBe(true)

      const state = manager.loadState()
      expect(state.steps['story-tests']).toBeDefined()
      expect(state.steps['story-tests'].status).toBe('pending')
      expect(state.steps['story-tests'].source).toBe('pipeline')
      expect(state.steps['story-tests'].produces).toEqual(['tests/acceptance/', 'docs/story-tests-map.md'])
    })

    it('does not overwrite existing steps', () => {
      const tempDir = makeTempDir()
      const manager = new StateManager(tempDir, computeEligible)
      manager.initializeState(INIT_OPTIONS)

      // Complete create-prd
      manager.setInProgress('create-prd', 'agent-1')
      manager.markCompleted('create-prd', ['docs/prd.md'], 'agent-1', 3)

      const pipelineSteps = [
        { slug: 'create-prd', produces: ['docs/prd.md'], enabled: true },
        { slug: 'create-architecture', produces: ['docs/architecture.md'], enabled: true },
      ]

      const changed = manager.reconcileWithPipeline(pipelineSteps)
      expect(changed).toBe(false)

      const state = manager.loadState()
      expect(state.steps['create-prd'].status).toBe('completed')
    })

    it('does not add disabled pipeline steps', () => {
      const tempDir = makeTempDir()
      const manager = new StateManager(tempDir, computeEligible)
      manager.initializeState(INIT_OPTIONS)

      const pipelineSteps = [
        { slug: 'create-prd', produces: ['docs/prd.md'], enabled: true },
        { slug: 'create-architecture', produces: ['docs/architecture.md'], enabled: true },
        { slug: 'disabled-step', produces: [], enabled: false },
      ]

      const changed = manager.reconcileWithPipeline(pipelineSteps)
      expect(changed).toBe(false)

      const state = manager.loadState()
      expect(state.steps['disabled-step']).toBeUndefined()
    })

    it('returns false when no steps are missing', () => {
      const tempDir = makeTempDir()
      const manager = new StateManager(tempDir, computeEligible)
      manager.initializeState(INIT_OPTIONS)

      const pipelineSteps = [
        { slug: 'create-prd', produces: ['docs/prd.md'], enabled: true },
        { slug: 'create-architecture', produces: ['docs/architecture.md'], enabled: true },
      ]

      const changed = manager.reconcileWithPipeline(pipelineSteps)
      expect(changed).toBe(false)
    })
  })

  describe('atomic writes', () => {
    it('state.json.tmp does not persist after successful write', () => {
      const tempDir = makeTempDir()
      const manager = new StateManager(tempDir, computeEligible)
      manager.initializeState(INIT_OPTIONS)

      const tmpPath = path.join(tempDir, '.scaffold', 'state.json.tmp')
      expect(fs.existsSync(tmpPath)).toBe(false)
    })
  })
})
