import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it, expect } from 'vitest'
import { migrateV2ToV3 } from './state-migration-v3.js'
import type { PipelineState } from '../types/index.js'

const tmpDirs: string[] = []

afterEach(() => {
  for (const d of tmpDirs) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
  }
  tmpDirs.length = 0
})

function tmpRoot(): string {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-migration-v3-test-'))
  tmpDirs.push(p)
  return p
}

function makeV2State(
  steps: Record<string, { status: string; source?: string }>,
  overrides: Partial<PipelineState> = {},
): PipelineState {
  const stepsObj: Record<string, { status: string; source: string }> = {}
  for (const [name, entry] of Object.entries(steps)) {
    stepsObj[name] = {
      status: entry.status,
      source: entry.source ?? 'pipeline',
    }
  }
  return {
    'schema-version': 2,
    'scaffold-version': '2.99.0',
    init_methodology: 'deep',
    config_methodology: 'deep',
    'init-mode': 'greenfield',
    created: '2026-01-01T00:00:00.000Z',
    in_progress: null,
    steps: stepsObj as PipelineState['steps'],
    next_eligible: [],
    'extra-steps': [],
    ...overrides,
  }
}

function writeState(projectRoot: string, state: PipelineState, service?: string): void {
  const scaffoldDir = service
    ? path.join(projectRoot, '.scaffold', 'services', service)
    : path.join(projectRoot, '.scaffold')
  fs.mkdirSync(scaffoldDir, { recursive: true })
  fs.writeFileSync(path.join(scaffoldDir, 'state.json'), JSON.stringify(state, null, 2))
}

function readState(projectRoot: string, service?: string): PipelineState {
  const scaffoldDir = service
    ? path.join(projectRoot, '.scaffold', 'services', service)
    : path.join(projectRoot, '.scaffold')
  return JSON.parse(fs.readFileSync(path.join(scaffoldDir, 'state.json'), 'utf8')) as PipelineState
}

describe('migrateV2ToV3', () => {
  it('happy path: splits v2 root into global + per-service state files', () => {
    const root = tmpRoot()
    const state = makeV2State({
      'setup':          { status: 'completed' },
      'create-prd':     { status: 'completed' },
      'implement-api':  { status: 'pending' },
      'implement-web':  { status: 'pending' },
    })
    writeState(root, state)

    const globalSteps = new Set(['setup', 'create-prd'])
    const services = [{ name: 'api' }, { name: 'web' }]

    migrateV2ToV3({ projectRoot: root, globalSteps, services })

    const rootState = readState(root)
    expect(rootState['schema-version']).toBe(3)
    expect(Object.keys(rootState.steps)).toEqual(expect.arrayContaining(['setup', 'create-prd']))
    expect(Object.keys(rootState.steps)).not.toContain('implement-api')
    expect(Object.keys(rootState.steps)).not.toContain('implement-web')

    const apiState = readState(root, 'api')
    expect(apiState['schema-version']).toBe(3)
    expect(Object.keys(apiState.steps)).toEqual(expect.arrayContaining(['implement-api', 'implement-web']))
    expect(Object.keys(apiState.steps)).not.toContain('setup')
    expect(Object.keys(apiState.steps)).not.toContain('create-prd')

    const webState = readState(root, 'web')
    expect(webState['schema-version']).toBe(3)
    expect(Object.keys(webState.steps)).toEqual(expect.arrayContaining(['implement-api', 'implement-web']))
    expect(Object.keys(webState.steps)).not.toContain('setup')
    expect(Object.keys(webState.steps)).not.toContain('create-prd')
  })

  it('rejects migration when in_progress is non-null', () => {
    const root = tmpRoot()
    const state = makeV2State(
      { 'setup': { status: 'completed' }, 'implement-api': { status: 'in_progress' } },
      {
        in_progress: {
          step: 'implement-api',
          started: '2026-01-01T00:00:00.000Z',
          partial_artifacts: [],
          actor: 'scaffold-run',
        },
      },
    )
    writeState(root, state)

    const globalSteps = new Set(['setup'])
    const services = [{ name: 'api' }]

    expect(() => migrateV2ToV3({ projectRoot: root, globalSteps, services })).toThrow(
      'Cannot migrate to per-service state while step \'implement-api\' is in progress.',
    )

    // Root should still be v2 — migration was rejected
    const rootState = readState(root)
    expect(rootState['schema-version']).toBe(2)
  })

  it('is idempotent: no-op when root state is already v3', () => {
    const root = tmpRoot()
    const state = makeV2State({ 'setup': { status: 'completed' } })
    const v3State: PipelineState = { ...state, 'schema-version': 3 }
    writeState(root, v3State)

    const globalSteps = new Set(['setup'])
    const services = [{ name: 'api' }]
    const statsBefore = fs.statSync(path.join(root, '.scaffold', 'state.json'))

    migrateV2ToV3({ projectRoot: root, globalSteps, services })

    const statsAfter = fs.statSync(path.join(root, '.scaffold', 'state.json'))
    // File not rewritten — mtime unchanged (or at least state stays v3)
    const rootState = readState(root)
    expect(rootState['schema-version']).toBe(3)
    // No service directories created
    expect(fs.existsSync(path.join(root, '.scaffold', 'services', 'api'))).toBe(false)
    // mtime should be unchanged (file not touched)
    expect(statsAfter.mtimeMs).toBe(statsBefore.mtimeMs)
  })

  it('rejects when globalSteps is empty', () => {
    const root = tmpRoot()
    const state = makeV2State({ 'setup': { status: 'completed' } })
    writeState(root, state)

    const globalSteps = new Set<string>()
    const services = [{ name: 'api' }]

    expect(() => migrateV2ToV3({ projectRoot: root, globalSteps, services })).toThrow(
      'Cannot migrate: globalSteps is empty.',
    )

    // Root should still be v2
    const rootState = readState(root)
    expect(rootState['schema-version']).toBe(2)
  })

  it('completed service steps are duplicated to ALL service state files', () => {
    const root = tmpRoot()
    const state = makeV2State({
      'setup':          { status: 'completed' },
      'implement-api':  { status: 'completed' },
      'implement-web':  { status: 'pending' },
    })
    writeState(root, state)

    const globalSteps = new Set(['setup'])
    const services = [{ name: 'api' }, { name: 'web' }, { name: 'mobile' }]

    migrateV2ToV3({ projectRoot: root, globalSteps, services })

    for (const svcName of ['api', 'web', 'mobile']) {
      const svcState = readState(root, svcName)
      expect(svcState.steps['implement-api']).toBeDefined()
      expect(svcState.steps['implement-api'].status).toBe('completed')
      expect(svcState.steps['implement-web']).toBeDefined()
      expect(svcState.steps['implement-web'].status).toBe('pending')
    }
  })

  it('extra-steps stay in root only; service state files have empty extra-steps', () => {
    const root = tmpRoot()
    const state = makeV2State(
      { 'setup': { status: 'completed' }, 'custom-step': { status: 'pending' } },
      {
        'extra-steps': [
          { slug: 'custom-step', path: 'content/pipeline/custom-step.md' },
        ],
      },
    )
    writeState(root, state)

    const globalSteps = new Set(['setup'])
    const services = [{ name: 'api' }]

    migrateV2ToV3({ projectRoot: root, globalSteps, services })

    const rootState = readState(root)
    expect(rootState['extra-steps']).toHaveLength(1)
    expect(rootState['extra-steps'][0].slug).toBe('custom-step')

    const apiState = readState(root, 'api')
    expect(apiState['extra-steps']).toHaveLength(0)
  })

  it('no-op when state file does not exist', () => {
    const root = tmpRoot()
    fs.mkdirSync(path.join(root, '.scaffold'), { recursive: true })
    // No state.json written

    const globalSteps = new Set(['setup'])
    const services = [{ name: 'api' }]

    // Should not throw
    expect(() => migrateV2ToV3({ projectRoot: root, globalSteps, services })).not.toThrow()

    // No service directories created
    expect(fs.existsSync(path.join(root, '.scaffold', 'services', 'api'))).toBe(false)
  })

  it('root state preserves scaffold-version and metadata fields after migration', () => {
    const root = tmpRoot()
    const state = makeV2State({
      'setup':    { status: 'completed' },
      'impl-api': { status: 'pending' },
    })
    writeState(root, state)

    const globalSteps = new Set(['setup'])
    const services = [{ name: 'api' }]

    migrateV2ToV3({ projectRoot: root, globalSteps, services })

    const rootState = readState(root)
    expect(rootState['scaffold-version']).toBe('2.99.0')
    expect(rootState.init_methodology).toBe('deep')
    expect(rootState['init-mode']).toBe('greenfield')
    expect(rootState.created).toBe('2026-01-01T00:00:00.000Z')
  })
})
