import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { DetectedConfig } from '../../types/config.js'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

vi.mock('../middleware/project-root.js', () => ({
  findProjectRoot: vi.fn(),
}))

vi.mock('../middleware/output-mode.js', () => ({
  resolveOutputMode: vi.fn(() => 'interactive'),
}))

vi.mock('../../config/loader.js', () => ({
  loadConfig: vi.fn(() => ({ config: { methodology: { preset: 'deep' } }, errors: [], warnings: [] })),
}))

vi.mock('../../state/state-manager.js', () => ({
  StateManager: vi.fn().mockImplementation(() => ({
    loadState: vi.fn(() => ({
      'schema-version': 1,
      'scaffold-version': '2.0.0',
      init_methodology: 'deep',
      config_methodology: 'deep',
      'init-mode': 'greenfield',
      created: '2024-01-01T00:00:00.000Z',
      in_progress: null,
      steps: {},
      next_eligible: [],
      'extra-steps': [],
    })),
    saveState: vi.fn(),
    initializeState: vi.fn(),
  })),
}))

vi.mock('../../state/lock-manager.js', () => ({
  acquireLock: vi.fn(() => ({ acquired: true })),
  getLockPath: vi.fn(() => '/mock/.scaffold/lock.json'),
  releaseLock: vi.fn(),
}))

vi.mock('../../project/adopt.js', () => ({
  runAdoption: vi.fn().mockResolvedValue({
    mode: 'greenfield',
    artifactsFound: 0,
    detectedArtifacts: [],
    stepsCompleted: [],
    stepsRemaining: [],
    methodology: 'deep',
    errors: [],
    warnings: [],
  }),
  TYPE_KEY: {
    'web-app':           'webAppConfig',
    'mobile-app':        'mobileAppConfig',
    'backend':           'backendConfig',
    'cli':               'cliConfig',
    'library':           'libraryConfig',
    'game':              'gameConfig',
    'data-pipeline':     'dataPipelineConfig',
    'ml':                'mlConfig',
    'browser-extension': 'browserExtensionConfig',
  },
}))

vi.mock('../../core/assembly/meta-prompt-loader.js', () => ({
  discoverMetaPrompts: vi.fn(() => new Map()),
}))

vi.mock('../shutdown.js', () => ({
  shutdown: {
    registerLockOwnership: vi.fn(),
    releaseLockOwnership: vi.fn(),
    withResource: vi.fn(async (_name: string, _cleanup: () => void, fn: () => Promise<unknown>) => fn()),
  },
}))

vi.mock('../../project/adoption-plan.js', () => ({
  buildAdoptionPlan: vi.fn(() => ({
    plan: {
      generated_at: '2026-07-19T00:00:00.000Z', project_root: '/mock', mode: 'brownfield',
      methodology: 'brownfield', includes: [], initialize: null, steps: [], disabled_by_preset: [],
      plan_key: 'f'.repeat(64),
    },
    errors: [],
  })),
  renderPlanMarkdown: vi.fn(() => `Plan key: ${'f'.repeat(64)}`),
  extractPlanKey: vi.fn((content: string) => (content.includes('f'.repeat(64)) ? 'f'.repeat(64) : null)),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { StateManager } from '../../state/state-manager.js'
import { acquireLock, releaseLock } from '../../state/lock-manager.js'
import { runAdoption } from '../../project/adopt.js'
import { buildAdoptionPlan } from '../../project/adoption-plan.js'
import adoptCommand from './adopt.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AdoptArgv = Parameters<typeof adoptCommand.handler>[0]

function defaultArgv(overrides: Partial<AdoptArgv> = {}): AdoptArgv {
  return {
    format: undefined,
    auto: undefined,
    verbose: undefined,
    root: undefined,
    force: undefined,
    'dry-run': false,
    ...overrides,
  } as AdoptArgv
}

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-adopt-cmd-test-'))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('adopt command', () => {
  let writtenLines: string[]
  let tmpDir: string

  const mockFindProjectRoot = vi.mocked(findProjectRoot)
  const mockResolveOutputMode = vi.mocked(resolveOutputMode)
  const MockStateManager = vi.mocked(StateManager)
  const mockAcquireLock = vi.mocked(acquireLock)
  const mockRunAdoption = vi.mocked(runAdoption)
  const mockBuildAdoptionPlan = vi.mocked(buildAdoptionPlan)

  beforeEach(() => {
    process.exitCode = undefined
    tmpDir = makeTempDir()
    writtenLines = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writtenLines.push(String(chunk))
      return true
    })
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    // Defaults
    mockFindProjectRoot.mockReturnValue('/fake/project')
    mockResolveOutputMode.mockReturnValue('interactive')
    mockAcquireLock.mockReturnValue({ acquired: true })
    mockRunAdoption.mockResolvedValue({
      mode: 'greenfield',
      artifactsFound: 0,
      detectedArtifacts: [],
      stepsCompleted: [],
      stepsRemaining: [],
      methodology: 'deep',
      errors: [],
      warnings: [],
    })

    type LoadReturn = ReturnType<InstanceType<typeof StateManager>['loadState']>
    MockStateManager.mockImplementation(() => ({
      loadState: vi.fn(
        () => ({
          'schema-version': 1,
          'scaffold-version': '2.0.0',
          init_methodology: 'deep',
          config_methodology: 'deep',
          'init-mode': 'greenfield',
          created: '2024-01-01T00:00:00.000Z',
          in_progress: null,
          steps: {},
          next_eligible: [],
          'extra-steps': [],
        }) as unknown as LoadReturn,
      ),
      saveState: vi.fn(),
      initializeState: vi.fn(),
    }) as unknown as InstanceType<typeof StateManager>)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  // Test 1 (R1 D2): first-touch — falls back to cwd instead of erroring when no .scaffold/ is found
  it('falls back to process.cwd() when no project root is found (first-touch adoption, D2)', async () => {
    mockFindProjectRoot.mockReturnValue(null)

    await adoptCommand.handler(defaultArgv())

    expect(mockRunAdoption).toHaveBeenCalledWith(
      expect.objectContaining({ projectRoot: process.cwd() }),
    )
    expect(process.exitCode).toBe(0)
  })

  // Test 3: Dry-run succeeds without modifying files
  it('dry-run succeeds and does not call initializeState or saveState', async () => {
    const mockInitializeState = vi.fn()
    const mockSaveState = vi.fn()
    type LoadReturn = ReturnType<InstanceType<typeof StateManager>['loadState']>
    MockStateManager.mockImplementation(() => ({
      loadState: vi.fn(
        () => ({
          'schema-version': 1,
          'scaffold-version': '2.0.0',
          init_methodology: 'deep',
          config_methodology: 'deep',
          'init-mode': 'greenfield',
          created: '2024-01-01T00:00:00.000Z',
          in_progress: null,
          steps: {},
          next_eligible: [],
          'extra-steps': [],
        }) as unknown as LoadReturn,
      ),
      saveState: mockSaveState,
      initializeState: mockInitializeState,
    }) as unknown as InstanceType<typeof StateManager>)

    await adoptCommand.handler(defaultArgv({ 'dry-run': true }))

    expect(mockInitializeState).not.toHaveBeenCalled()
    expect(mockSaveState).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(0)
  })

  // Test 4 (R1 D1): JSON output has the schema_version 3 plan fields
  it('JSON output has required plan fields', async () => {
    mockResolveOutputMode.mockReturnValue('json')

    await adoptCommand.handler(defaultArgv({ format: 'json' }))

    const allOutput = writtenLines.join('')
    const envelope = JSON.parse(allOutput)
    const parsed = envelope.data ?? envelope
    expect(parsed).toHaveProperty('schema_version', 3)
    expect(parsed).toHaveProperty('mode', 'brownfield')
    expect(parsed).toHaveProperty('plan_key')
    expect(parsed).toHaveProperty('disabled_by_preset')
    expect(parsed).toHaveProperty('initialize')
    expect(Array.isArray(parsed.steps)).toBe(true)
    expect(process.exitCode).toBe(0)
  })

  // Test 5 (R1 D1): plan mode never initializes state, even when state.json is absent
  it('does not call initializeState when state does not exist', async () => {
    // Use real tmpDir with no .scaffold/state.json — existsSync will return false naturally
    mockFindProjectRoot.mockReturnValue(tmpDir)

    const mockInitializeState = vi.fn()
    const mockSaveState = vi.fn()
    type LoadReturn = ReturnType<InstanceType<typeof StateManager>['loadState']>
    MockStateManager.mockImplementation(() => ({
      loadState: vi.fn(
        () => ({
          'schema-version': 1,
          'scaffold-version': '2.0.0',
          init_methodology: 'deep',
          config_methodology: 'deep',
          'init-mode': 'greenfield',
          created: '2024-01-01T00:00:00.000Z',
          in_progress: null,
          steps: {},
          next_eligible: [],
          'extra-steps': [],
        }) as unknown as LoadReturn,
      ),
      saveState: mockSaveState,
      initializeState: mockInitializeState,
    }) as unknown as InstanceType<typeof StateManager>)

    await adoptCommand.handler(defaultArgv())

    expect(mockInitializeState).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(0)
  })

  // Test 6 (R1 D1): plan mode does not write config.yml, even when a project type is detected
  it('does not write config.yml when game detected (plan mode)', async () => {
    // Create .scaffold/ dir in tmpDir but no config.yml
    const scaffoldDir = path.join(tmpDir, '.scaffold')
    fs.mkdirSync(scaffoldDir, { recursive: true })
    mockFindProjectRoot.mockReturnValue(tmpDir)

    mockRunAdoption.mockResolvedValue({
      mode: 'brownfield',
      artifactsFound: 1,
      detectedArtifacts: [],
      stepsCompleted: [],
      stepsRemaining: [],
      methodology: 'deep',
      errors: [],
      warnings: [],
      projectType: 'game',
      gameConfig: { engine: 'unity' },
      detectedConfig: { type: 'game', config: { engine: 'unity' } } as DetectedConfig,
    })

    await adoptCommand.handler(defaultArgv())

    const configPath = path.join(scaffoldDir, 'config.yml')
    expect(fs.existsSync(configPath)).toBe(false)
    expect(process.exitCode).toBe(0)
  })

  // Test 7 (R1 D1): plan mode never calls saveState, even when state.json exists
  it('does not call saveState when state.json exists (plan mode)', async () => {
    // Create .scaffold/state.json in tmpDir so fs.existsSync returns true
    const scaffoldDir = path.join(tmpDir, '.scaffold')
    fs.mkdirSync(scaffoldDir, { recursive: true })
    fs.writeFileSync(path.join(scaffoldDir, 'state.json'), '{}')

    mockFindProjectRoot.mockReturnValue(tmpDir)

    const stepsInState: Record<string, { status: string; at?: string; completed_by?: string; depth?: number }> = {
      'step-a': { status: 'pending' },
    }

    const mockSaveState = vi.fn()
    type LoadReturn = ReturnType<InstanceType<typeof StateManager>['loadState']>
    MockStateManager.mockImplementation(() => ({
      loadState: vi.fn(
        () => ({
          'schema-version': 1,
          'scaffold-version': '2.0.0',
          init_methodology: 'deep',
          config_methodology: 'deep',
          'init-mode': 'greenfield',
          created: '2024-01-01T00:00:00.000Z',
          in_progress: null,
          steps: stepsInState,
          next_eligible: [],
          'extra-steps': [],
        }) as unknown as LoadReturn,
      ),
      saveState: mockSaveState,
      initializeState: vi.fn(),
    }) as unknown as InstanceType<typeof StateManager>)

    mockRunAdoption.mockResolvedValue({
      mode: 'greenfield',
      artifactsFound: 1,
      detectedArtifacts: [],
      stepsCompleted: ['step-a'],
      stepsRemaining: [],
      methodology: 'deep',
      errors: [],
      warnings: [],
    })

    await adoptCommand.handler(defaultArgv())

    expect(mockSaveState).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(0)

    void releaseLock
  })

  // Test 8: --project-type macos-native + --macos-ui-framework hybrid is accepted (not rejected by strict mode)
  it('accepts --project-type macos-native with --macos-ui-framework hybrid flag', async () => {
    await adoptCommand.handler(
      defaultArgv({
        'project-type': 'macos-native',
        'macos-ui-framework': 'hybrid',
      }),
    )

    // runAdoption should be called — no strict-mode rejection
    expect(mockRunAdoption).toHaveBeenCalled()
    expect(process.exitCode).toBe(0)
  })

  // Test 9 (R1 D1): plan mode writes nothing by default
  it('plan mode writes nothing: no state initialization, no config write, no lock', async () => {
    vi.mocked(findProjectRoot).mockReturnValue('/mock')
    await adoptCommand.handler(defaultArgv())
    expect(vi.mocked(StateManager)).not.toHaveBeenCalled()
    expect(mockAcquireLock).not.toHaveBeenCalled()
    const written = writtenLines.join('')
    expect(written).toContain('Plan key:')
  })

  // Test 10 (R1 D1): JSON output is the plan object with schema_version 3
  it('JSON output is the plan object with schema_version 3', async () => {
    vi.mocked(findProjectRoot).mockReturnValue('/mock')
    vi.mocked(resolveOutputMode).mockReturnValue('json')
    await adoptCommand.handler(defaultArgv({ format: 'json' }))
    const envelope = JSON.parse(writtenLines.join('')) as { data?: unknown }
    const parsed = (envelope.data ?? envelope) as { schema_version: number; plan_key: string; steps: unknown[] }
    expect(parsed.schema_version).toBe(3)
    expect(parsed.plan_key).toBe('f'.repeat(64))
    expect(Array.isArray(parsed.steps)).toBe(true)
  })

  // Test 11 (R1 T9 review): bare --write writes the default path
  it('bare --write writes the default plan path with rendered plan markdown', async () => {
    mockFindProjectRoot.mockReturnValue(tmpDir)

    await adoptCommand.handler(defaultArgv({ write: '' }))

    const defaultPath = path.join(tmpDir, 'docs', 'adoption-plan.md')
    expect(fs.existsSync(defaultPath)).toBe(true)
    const content = fs.readFileSync(defaultPath, 'utf8')
    expect(content).toContain('Plan key:')
    expect(process.exitCode).toBe(0)
  })

  // Test 12 (R1 T9 review): --write <path> writes the given (nested) path, not the default
  it('--write <path> writes the given path and not the default path', async () => {
    mockFindProjectRoot.mockReturnValue(tmpDir)

    await adoptCommand.handler(defaultArgv({ write: 'notes/custom-plan.md' }))

    const customPath = path.join(tmpDir, 'notes', 'custom-plan.md')
    const defaultPath = path.join(tmpDir, 'docs', 'adoption-plan.md')
    expect(fs.existsSync(customPath)).toBe(true)
    const content = fs.readFileSync(customPath, 'utf8')
    expect(content).toContain('Plan key:')
    expect(fs.existsSync(defaultPath)).toBe(false)
    expect(process.exitCode).toBe(0)
  })

  // Test 13 (R1 T9 review): no --write writes no plan file at all
  it('writes no plan file when --write is omitted', async () => {
    mockFindProjectRoot.mockReturnValue(tmpDir)

    await adoptCommand.handler(defaultArgv())

    const defaultPath = path.join(tmpDir, 'docs', 'adoption-plan.md')
    expect(fs.existsSync(defaultPath)).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, 'docs'))).toBe(false)
    expect(process.exitCode).toBe(0)
  })

  // Test 14 (R1 T9 review): --include is threaded through to buildAdoptionPlan
  it('passes --include values through to buildAdoptionPlan', async () => {
    mockFindProjectRoot.mockReturnValue(tmpDir)
    mockBuildAdoptionPlan.mockClear()

    await adoptCommand.handler(defaultArgv({ include: ['foo'] }))

    expect(mockBuildAdoptionPlan).toHaveBeenCalledWith(
      expect.objectContaining({ includes: ['foo'] }),
    )
    expect(process.exitCode).toBe(0)
  })
})
