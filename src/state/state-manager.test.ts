import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, afterEach } from 'vitest'
import { StateManager } from './state-manager.js'
import { StatePathResolver } from './state-path-resolver.js'

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

    it('throws STEP_NOT_IN_STATE for an unknown step slug', () => {
      const tempDir = makeTempDir()
      const manager = new StateManager(tempDir, computeEligible)
      manager.initializeState(INIT_OPTIONS)

      expect(() => manager.markCompleted('nonexistent-step', [], 'agent-1', 3))
        .toThrow('nonexistent-step')
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

  describe('service-scoped merged state view', () => {
    function writeState(dir: string, body: Record<string, unknown>): void {
      fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(body, null, 2), 'utf8')
    }

    function baseState(steps: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        'schema-version': 2,
        'scaffold-version': '2.0.0',
        init_methodology: 'deep',
        config_methodology: 'deep',
        'init-mode': 'greenfield',
        created: new Date().toISOString(),
        in_progress: null,
        steps,
        next_eligible: [],
        'extra-steps': [],
      }
    }

    function makeServiceDirs(tempDir: string, serviceName: string): { rootDir: string; serviceDir: string } {
      const rootDir = path.join(tempDir, '.scaffold')
      const serviceDir = path.join(rootDir, 'services', serviceName)
      fs.mkdirSync(rootDir, { recursive: true })
      fs.mkdirSync(serviceDir, { recursive: true })
      return { rootDir, serviceDir }
    }

    it('loadState returns merged steps (global + service)', () => {
      const tempDir = makeTempDir()
      const { rootDir, serviceDir } = makeServiceDirs(tempDir, 'api')

      // Global state has create-prd completed
      writeState(rootDir, baseState({
        'create-prd': { status: 'completed', source: 'pipeline', produces: ['docs/prd.md'] },
        'create-architecture': { status: 'pending', source: 'pipeline', produces: [] },
      }))

      // Service state has service-setup pending
      writeState(serviceDir, baseState({
        'service-setup': { status: 'pending', source: 'pipeline', produces: [] },
      }))

      const resolver = new StatePathResolver(tempDir, 'api')
      const manager = new StateManager(
        tempDir,
        computeEligible,
        () => ({ project: { services: [{ name: 'api' }] } }),
        resolver,
      )

      const state = manager.loadState()
      // Should have all three steps: two from global, one from service
      expect(state.steps['create-prd']?.status).toBe('completed')
      expect(state.steps['create-architecture']?.status).toBe('pending')
      expect(state.steps['service-setup']?.status).toBe('pending')
    })

    it('loadState: service steps override global steps on conflict', () => {
      const tempDir = makeTempDir()
      const { rootDir, serviceDir } = makeServiceDirs(tempDir, 'api')

      writeState(rootDir, baseState({
        'create-prd': { status: 'pending', source: 'pipeline', produces: [] },
      }))

      // Service overrides same step with completed
      writeState(serviceDir, baseState({
        'create-prd': { status: 'completed', source: 'pipeline', produces: ['docs/prd.md'] },
      }))

      const resolver = new StatePathResolver(tempDir, 'api')
      const manager = new StateManager(
        tempDir,
        computeEligible,
        () => ({ project: { services: [{ name: 'api' }] } }),
        resolver,
      )

      const state = manager.loadState()
      expect(state.steps['create-prd']?.status).toBe('completed')
    })

    it('saveState strips global steps before writing', () => {
      const tempDir = makeTempDir()
      const { rootDir, serviceDir } = makeServiceDirs(tempDir, 'api')

      const globalSteps = new Set(['create-prd', 'create-architecture'])

      writeState(rootDir, baseState({
        'create-prd': { status: 'completed', source: 'pipeline', produces: [] },
        'create-architecture': { status: 'pending', source: 'pipeline', produces: [] },
      }))

      writeState(serviceDir, baseState({
        'service-setup': { status: 'pending', source: 'pipeline', produces: [] },
      }))

      const resolver = new StatePathResolver(tempDir, 'api')
      const manager = new StateManager(
        tempDir,
        computeEligible,
        () => ({ project: { services: [{ name: 'api' }] } }),
        resolver,
        globalSteps,
      )

      // Load merged state then save it back
      const state = manager.loadState()
      // Merged state should have all 3 steps
      expect(Object.keys(state.steps)).toHaveLength(3)

      manager.saveState(state)

      // Read the service state file directly — should only have service-setup
      const written = JSON.parse(fs.readFileSync(path.join(serviceDir, 'state.json'), 'utf8'))
      expect(written.steps['service-setup']).toBeDefined()
      expect(written.steps['create-prd']).toBeUndefined()
      expect(written.steps['create-architecture']).toBeUndefined()
    })

    it('reconcileWithPipeline skips global steps when service-scoped', () => {
      const tempDir = makeTempDir()
      const { rootDir, serviceDir } = makeServiceDirs(tempDir, 'api')

      const globalSteps = new Set(['create-prd', 'create-architecture'])

      writeState(rootDir, baseState({
        'create-prd': { status: 'completed', source: 'pipeline', produces: [] },
        'create-architecture': { status: 'pending', source: 'pipeline', produces: [] },
      }))

      writeState(serviceDir, baseState({}))

      const resolver = new StatePathResolver(tempDir, 'api')
      const manager = new StateManager(
        tempDir,
        computeEligible,
        () => ({ project: { services: [{ name: 'api' }] } }),
        resolver,
        globalSteps,
      )

      const pipelineSteps = [
        { slug: 'create-prd', produces: ['docs/prd.md'], enabled: true },
        { slug: 'create-architecture', produces: ['docs/architecture.md'], enabled: true },
        { slug: 'service-setup', produces: [], enabled: true },
      ]

      const changed = manager.reconcileWithPipeline(pipelineSteps)
      expect(changed).toBe(true)

      // Read back from service state file — only service-setup should be added
      const written = JSON.parse(fs.readFileSync(path.join(serviceDir, 'state.json'), 'utf8'))
      expect(written.steps['service-setup']).toBeDefined()
      expect(written.steps['service-setup'].status).toBe('pending')
      expect(written.steps['create-prd']).toBeUndefined()
      expect(written.steps['create-architecture']).toBeUndefined()
    })

    it('loadState works without global state file', () => {
      const tempDir = makeTempDir()
      const { serviceDir } = makeServiceDirs(tempDir, 'api')

      // Only service state, no global state
      writeState(serviceDir, baseState({
        'service-setup': { status: 'pending', source: 'pipeline', produces: [] },
      }))

      // Don't write any global state file

      const resolver = new StatePathResolver(tempDir, 'api')
      const manager = new StateManager(
        tempDir,
        computeEligible,
        () => ({ project: { services: [{ name: 'api' }] } }),
        resolver,
      )

      const state = manager.loadState()
      expect(state.steps['service-setup']?.status).toBe('pending')
      expect(Object.keys(state.steps)).toHaveLength(1)
    })
  })

  describe('StateManager — schema-version dispatch (Wave 3a)', () => {
    function writeRawState(dir: string, body: Record<string, unknown>): void {
      const statePath = path.join(dir, '.scaffold', 'state.json')
      fs.writeFileSync(statePath, JSON.stringify(body, null, 2), 'utf8')
    }

    function baseV1State(): Record<string, unknown> {
      return {
        'schema-version': 1,
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
    }

    it('loads v1 state when config has no services', () => {
      const tempDir = makeTempDir()
      writeRawState(tempDir, baseV1State())

      // configProvider returns a single-service-shaped config (no services[])
      const manager = new StateManager(
        tempDir,
        computeEligible,
        () => ({ project: {} }),
      )

      const state = manager.loadState()
      expect(state['schema-version']).toBe(1)
    })

    it('bumps v1 state to v2 in memory when config has services[]', () => {
      const tempDir = makeTempDir()
      writeRawState(tempDir, baseV1State())

      const manager = new StateManager(
        tempDir,
        computeEligible,
        () => ({ project: { services: [{ name: 'svc-a' }, { name: 'svc-b' }] } }),
      )

      const state = manager.loadState()
      expect(state['schema-version']).toBe(2)
    })

    it('rejects unknown schema-version', () => {
      const tempDir = makeTempDir()
      const bad = baseV1State()
      bad['schema-version'] = 99
      writeRawState(tempDir, bad)

      const manager = new StateManager(tempDir, computeEligible, () => undefined)

      expect(() => manager.loadState()).toThrow()
      try {
        manager.loadState()
      } catch (err) {
        expect((err as { code: string }).code).toBe('STATE_SCHEMA_VERSION')
      }
    })

    it('accepts v2 state unchanged', () => {
      const tempDir = makeTempDir()
      const v2 = baseV1State()
      v2['schema-version'] = 2
      writeRawState(tempDir, v2)

      const manager = new StateManager(
        tempDir,
        computeEligible,
        () => ({ project: { services: [{ name: 'svc-a' }] } }),
      )

      const state = manager.loadState()
      expect(state['schema-version']).toBe(2)
    })
  })

  describe('loadStateReadOnly (Wave 3c)', () => {
    it('applies migrateState in memory but does NOT write to disk', () => {
      const tmpRoot = makeTempDir()
      const statePath = path.join(tmpRoot, '.scaffold', 'state.json')
      // v3 state with a deprecated step name that migrateState will rename
      const preMigrationState = {
        'schema-version': 3,
        steps: {
          'testing-strategy': {
            status: 'completed',
            source: 'pipeline',
            produces: ['docs/tdd.md'],
          },
        },
        next_eligible: ['keep-this'],
        in_progress: null,
      }
      fs.writeFileSync(statePath, JSON.stringify(preMigrationState))
      // Backdate so a subsequent write would produce a detectably newer mtime
      const backdated = new Date(Date.now() - 2000)
      fs.utimesSync(statePath, backdated, backdated)
      const originalMtime = fs.statSync(statePath).mtimeMs

      const resolver = new StatePathResolver(tmpRoot)
      const state = StateManager.loadStateReadOnly(tmpRoot, resolver)

      // Step rename applied in memory
      expect(state.steps['tdd']).toBeDefined()
      expect(state.steps['testing-strategy']).toBeUndefined()
      // next_eligible preserved — NOT clobbered by a computeEligible sentinel
      expect(state.next_eligible).toEqual(['keep-this'])
      // File NOT written
      expect(fs.statSync(statePath).mtimeMs).toBe(originalMtime)
    })

    it('merges global state as read-only base when pathResolver is service-scoped', () => {
      const tmpRoot = makeTempDir()
      fs.mkdirSync(path.join(tmpRoot, '.scaffold', 'services', 'api'), { recursive: true })
      fs.writeFileSync(path.join(tmpRoot, '.scaffold', 'state.json'), JSON.stringify({
        'schema-version': 3,
        steps: {
          'project-overview': {
            status: 'completed',
            source: 'pipeline',
            produces: ['docs/vision.md'],
          },
        },
        next_eligible: [],
        in_progress: null,
      }))
      fs.writeFileSync(
        path.join(tmpRoot, '.scaffold', 'services', 'api', 'state.json'),
        JSON.stringify({
          'schema-version': 3,
          steps: {
            'api-contracts': {
              status: 'completed',
              source: 'pipeline',
              produces: ['docs/api.md'],
            },
          },
          next_eligible: [],
          in_progress: null,
        }),
      )

      const resolver = new StatePathResolver(tmpRoot, 'api')
      const state = StateManager.loadStateReadOnly(tmpRoot, resolver)
      expect(state.steps['project-overview']).toBeDefined()  // from global
      expect(state.steps['api-contracts']).toBeDefined()     // from service
    })

    it('throws STATE_MISSING when file does not exist', () => {
      const tmpRoot = makeTempDir()
      // Don't create state.json
      const resolver = new StatePathResolver(tmpRoot)
      expect(() => StateManager.loadStateReadOnly(tmpRoot, resolver)).toThrow(
        expect.objectContaining({ code: 'STATE_MISSING' }),
      )
    })

    it('applies migrations to merged global state (no stale step renames leak)', () => {
      const tmpRoot = makeTempDir()
      fs.mkdirSync(path.join(tmpRoot, '.scaffold', 'services', 'api'), { recursive: true })
      // Global has a deprecated step name
      fs.writeFileSync(path.join(tmpRoot, '.scaffold', 'state.json'), JSON.stringify({
        'schema-version': 3,
        steps: {
          'testing-strategy': {
            status: 'completed', source: 'pipeline', produces: ['docs/tdd.md'],
          },
        },
        next_eligible: [], in_progress: null,
      }))
      fs.writeFileSync(
        path.join(tmpRoot, '.scaffold', 'services', 'api', 'state.json'),
        JSON.stringify({
          'schema-version': 3,
          steps: {},
          next_eligible: [], in_progress: null,
        }),
      )
      const resolver = new StatePathResolver(tmpRoot, 'api')
      const state = StateManager.loadStateReadOnly(tmpRoot, resolver)
      // Stale name renamed in merged view
      expect(state.steps['tdd']).toBeDefined()
      expect(state.steps['testing-strategy']).toBeUndefined()
    })
  })

  describe('StateManager — pipelineHash + loadedRootCounter (Eligible-Cache v2)', () => {
    it('constructor accepts optional pipelineHash parameter', () => {
      const sm = new StateManager(
        '/fake/project',
        (_steps, _opts) => [],
        () => undefined,
        new StatePathResolver('/fake/project'),
        undefined,
        'test-hash-abc',  // NEW param
      )
      expect(sm).toBeDefined()
    })

    it('service-mode loadState captures root save_counter into loadedRootCounter', () => {
      const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-capture-'))
      try {
        fs.mkdirSync(path.join(tmpRoot, '.scaffold', 'services', 'api'), { recursive: true })
        fs.writeFileSync(
          path.join(tmpRoot, '.scaffold', 'state.json'),
          JSON.stringify({
            'schema-version': 3,
            'scaffold-version': '1.0.0',
            init_methodology: 'deep',
            config_methodology: 'deep',
            'init-mode': 'greenfield',
            created: '2026-04-20T00:00:00.000Z',
            in_progress: null,
            steps: {},
            next_eligible: [],
            'extra-steps': [],
            save_counter: 7,
          }),
        )
        fs.writeFileSync(
          path.join(tmpRoot, '.scaffold', 'services', 'api', 'state.json'),
          JSON.stringify({
            'schema-version': 3,
            'scaffold-version': '1.0.0',
            init_methodology: 'deep',
            config_methodology: 'deep',
            'init-mode': 'greenfield',
            created: '2026-04-20T00:00:00.000Z',
            in_progress: null,
            steps: {},
            next_eligible: [],
            'extra-steps': [],
          }),
        )
        const sm = new StateManager(
          tmpRoot,
          (_s, _o) => [],
          () => undefined,
          new StatePathResolver(tmpRoot, 'api'),
          new Set(),
          'test-hash',
        )
        sm.loadState()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((sm as any).loadedRootCounter).toBe(7)
      } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true })
      }
    })

    it('service-mode loadState sets loadedRootCounter to null when root is missing save_counter', () => {
      const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-capture-null-'))
      try {
        fs.mkdirSync(path.join(tmpRoot, '.scaffold', 'services', 'api'), { recursive: true })
        fs.writeFileSync(
          path.join(tmpRoot, '.scaffold', 'state.json'),
          JSON.stringify({
            'schema-version': 3,
            'scaffold-version': '1.0.0',
            init_methodology: 'deep',
            config_methodology: 'deep',
            'init-mode': 'greenfield',
            created: '2026-04-20T00:00:00.000Z',
            in_progress: null,
            steps: {},
            next_eligible: [],
            'extra-steps': [],
          }),
        )
        fs.writeFileSync(
          path.join(tmpRoot, '.scaffold', 'services', 'api', 'state.json'),
          JSON.stringify({
            'schema-version': 3,
            'scaffold-version': '1.0.0',
            init_methodology: 'deep',
            config_methodology: 'deep',
            'init-mode': 'greenfield',
            created: '2026-04-20T00:00:00.000Z',
            in_progress: null,
            steps: {},
            next_eligible: [],
            'extra-steps': [],
          }),
        )
        const sm = new StateManager(
          tmpRoot,
          (_s, _o) => [],
          () => undefined,
          new StatePathResolver(tmpRoot, 'api'),
          new Set(),
          'test-hash',
        )
        sm.loadState()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((sm as any).loadedRootCounter).toBeNull()
      } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true })
      }
    })
  })
})
