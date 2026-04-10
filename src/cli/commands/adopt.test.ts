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

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { StateManager } from '../../state/state-manager.js'
import { acquireLock, releaseLock } from '../../state/lock-manager.js'
import { runAdoption } from '../../project/adopt.js'
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

  // Test 1: Exits 1 when project root not found
  it('exits 1 when project root not found', async () => {
    mockFindProjectRoot.mockReturnValue(null)

    await adoptCommand.handler(defaultArgv())

    expect(process.exitCode).toBe(1)
  })

  // Test 2: Exits 3 when lock not acquired
  it('exits 3 when lock not acquired', async () => {
    mockAcquireLock.mockReturnValue({
      acquired: false,
      error: {
        code: 'LOCK_HELD',
        message: 'Lock is held by another process',
        exitCode: 5,
      },
    })

    await adoptCommand.handler(defaultArgv())

    expect(process.exitCode).toBe(3)
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

  // Test 4: JSON output has mode, artifacts_found, steps_completed, steps_remaining fields
  it('JSON output has required fields', async () => {
    mockResolveOutputMode.mockReturnValue('json')
    mockRunAdoption.mockResolvedValue({
      mode: 'brownfield',
      artifactsFound: 2,
      detectedArtifacts: [],
      stepsCompleted: ['step-a', 'step-b'],
      stepsRemaining: ['step-c'],
      methodology: 'deep',
      errors: [],
      warnings: [],
    })

    await adoptCommand.handler(defaultArgv({ format: 'json' }))

    const allOutput = writtenLines.join('')
    const envelope = JSON.parse(allOutput)
    const parsed = envelope.data ?? envelope
    expect(parsed).toHaveProperty('mode', 'brownfield')
    expect(parsed).toHaveProperty('artifacts_found', 2)
    expect(parsed).toHaveProperty('steps_completed')
    expect(parsed).toHaveProperty('steps_remaining')
    expect(Array.isArray(parsed.steps_completed)).toBe(true)
    expect(Array.isArray(parsed.steps_remaining)).toBe(true)
    expect(process.exitCode).toBe(0)
  })

  // Test 5: Writes state.json when not dry-run — state gets initialized when state.json doesn't exist
  it('calls initializeState when state does not exist and not dry-run', async () => {
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

    await adoptCommand.handler(defaultArgv({ 'dry-run': false }))

    // state.json doesn't exist so initializeState should be called
    expect(mockInitializeState).toHaveBeenCalled()
    expect(process.exitCode).toBe(0)
  })

  // Test 6: Writes detected game config to config.yml (even when config doesn't exist)
  it('writes projectType and gameConfig to config.yml when game detected', async () => {
    // Create .scaffold/ dir in tmpDir but no config.yml
    const scaffoldDir = path.join(tmpDir, '.scaffold')
    fs.mkdirSync(scaffoldDir, { recursive: true })
    // No state.json either — triggers initializeState path
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

    await adoptCommand.handler(defaultArgv({ 'dry-run': false }))

    const configPath = path.join(scaffoldDir, 'config.yml')
    expect(fs.existsSync(configPath)).toBe(true)
    const configContent = fs.readFileSync(configPath, 'utf8')
    expect(configContent).toContain('projectType: game')
    expect(configContent).toContain('engine: unity')
    expect(process.exitCode).toBe(0)
  })

  // Test 7: Marks matched steps as completed in state
  it('marks stepsCompleted in state when state.json exists', async () => {
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

    await adoptCommand.handler(defaultArgv({ 'dry-run': false }))

    // Verify saveState was called and step-a is now completed
    expect(mockSaveState).toHaveBeenCalled()
    const savedState = mockSaveState.mock.calls[0][0] as { steps: typeof stepsInState }
    const stepA = savedState.steps['step-a']
    expect(stepA.status).toBe('completed')
    expect(stepA.completed_by).toBe('scaffold-adopt')
    expect(process.exitCode).toBe(0)

    void releaseLock
  })
})
