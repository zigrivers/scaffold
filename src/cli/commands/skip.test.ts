import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

vi.mock('../middleware/project-root.js', () => ({
  findProjectRoot: vi.fn(),
}))

vi.mock('../middleware/output-mode.js', () => ({
  resolveOutputMode: vi.fn(() => 'interactive'),
}))

vi.mock('../../state/state-manager.js', () => ({
  StateManager: vi.fn().mockImplementation(() => ({
    loadState: vi.fn(),
    markSkipped: vi.fn(),
    reconcileWithPipeline: vi.fn(() => false),
  })),
}))

vi.mock('../../state/lock-manager.js', () => ({
  acquireLock: vi.fn(() => ({ acquired: true })),
  releaseLock: vi.fn(),
  getLockPath: vi.fn(() => '/mock/.scaffold/lock.json'),
}))

vi.mock('../shutdown.js', () => ({
  shutdown: {
    withResource: vi.fn((_name: string, _cleanup: unknown, fn: () => unknown) => fn()),
    withPrompt: vi.fn((fn: () => unknown) => fn()),
    registerLockOwnership: vi.fn(),
    releaseLockOwnership: vi.fn(),
  },
}))

vi.mock('../../utils/levenshtein.js', () => ({
  findClosestMatch: vi.fn(() => null),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { StateManager } from '../../state/state-manager.js'
import { acquireLock, getLockPath, releaseLock } from '../../state/lock-manager.js'
import { findClosestMatch } from '../../utils/levenshtein.js'
import skipCommand from './skip.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('skip command', () => {
  let exitSpy: MockInstance
  let stdoutSpy: MockInstance
  let stderrSpy: MockInstance
  let writtenLines: string[]

  const mockFindProjectRoot = vi.mocked(findProjectRoot)
  const mockResolveOutputMode = vi.mocked(resolveOutputMode)
  const MockStateManager = vi.mocked(StateManager)
  const mockAcquireLock = vi.mocked(acquireLock)
  const mockFindClosestMatch = vi.mocked(findClosestMatch)

  beforeEach(() => {
    writtenLines = []
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writtenLines.push(String(chunk))
      return true
    })
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      writtenLines.push(String(chunk))
      return true
    })

    // Defaults
    mockFindProjectRoot.mockReturnValue('/fake/project')
    mockResolveOutputMode.mockReturnValue('interactive')
    mockAcquireLock.mockReturnValue({ acquired: true })
    mockFindClosestMatch.mockReturnValue(null)

    // Default state with a pending step
    MockStateManager.mockImplementation(() => ({
      loadState: vi.fn(() =>
        makeState({
          steps: {
            'some-step': { status: 'pending', source: 'pipeline', produces: [] },
          },
          next_eligible: ['other-step'],
        }) as unknown as ReturnType<InstanceType<typeof StateManager>['loadState']>,
      ),
      markSkipped: vi.fn(),
      reconcileWithPipeline: vi.fn(() => false),
    }) as unknown as InstanceType<typeof StateManager>)
  })

  afterEach(() => {
    process.exitCode = undefined
    vi.restoreAllMocks()
  })

  // Test 1: Exits 1 when project root not found
  it('exits 1 when project root not found', async () => {
    mockFindProjectRoot.mockReturnValue(null)

    const argv = {
      step: 'some-step',
      reason: undefined,
      format: undefined,
      auto: undefined,
      verbose: undefined,
      root: undefined,
      force: undefined,
    }
    await skipCommand.handler(argv as Parameters<typeof skipCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  // Test 2: Marks step as skipped successfully
  it('reconciles state before existence check so new pipeline steps are skippable', async () => {
    // Round-1 Codex P0 on PR #312: with reconcile dropped from
    // status/next, mutating commands had to take over the responsibility
    // of pulling new pipeline steps into state. Without this call,
    // `scaffold skip <new-step>` would fail with DEP_TARGET_MISSING for
    // a step added in a recent scaffold version upgrade.
    const reconcileFn = vi.fn(() => true)
    const markSkippedFn = vi.fn()
    MockStateManager.mockImplementation(() => ({
      loadState: vi.fn(() =>
        makeState({
          // Brand-new pipeline step that was never in state pre-call.
          // After reconcile runs, the entry is added as pending — so
          // by the time the existence check at skip.ts:126 fires, the
          // slug is in state.steps and the skip proceeds.
          steps: {
            'newly-added-step': { status: 'pending', source: 'pipeline', produces: [] },
          },
          next_eligible: [],
        }) as unknown as ReturnType<InstanceType<typeof StateManager>['loadState']>,
      ),
      markSkipped: markSkippedFn,
      reconcileWithPipeline: reconcileFn,
    }) as unknown as InstanceType<typeof StateManager>)

    const argv = {
      step: 'newly-added-step',
      reason: 'no longer applicable',
      format: undefined,
      auto: undefined,
      verbose: undefined,
      root: undefined,
      force: undefined,
    }
    await skipCommand.handler(argv as Parameters<typeof skipCommand.handler>[0])

    expect(reconcileFn).toHaveBeenCalledTimes(1)
    expect(markSkippedFn).toHaveBeenCalledWith('newly-added-step', 'no longer applicable', 'scaffold-skip')
  })

  it('marks step as skipped successfully', async () => {
    const mockMarkSkipped = vi.fn()
    MockStateManager.mockImplementation(() => ({
      loadState: vi.fn(() =>
        makeState({
          steps: {
            'some-step': { status: 'pending', source: 'pipeline', produces: [] },
          },
          next_eligible: ['other-step'],
        }) as unknown as ReturnType<InstanceType<typeof StateManager>['loadState']>,
      ),
      markSkipped: mockMarkSkipped,
      reconcileWithPipeline: vi.fn(() => false),
    }) as unknown as InstanceType<typeof StateManager>)

    const argv = {
      step: 'some-step',
      reason: 'not needed',
      format: undefined,
      auto: undefined,
      verbose: undefined,
      root: undefined,
      force: undefined,
    }
    await skipCommand.handler(argv as Parameters<typeof skipCommand.handler>[0])

    expect(mockMarkSkipped).toHaveBeenCalledWith('some-step', 'not needed', 'scaffold-skip')
    expect(process.exitCode).toBe(0)
  })

  // Test 3: Step not found exits 2 with DEP_TARGET_MISSING
  it('step not found exits 2 with DEP_TARGET_MISSING', async () => {
    MockStateManager.mockImplementation(() => ({
      loadState: vi.fn(() =>
        makeState({
          steps: { 'existing-step': { status: 'pending', source: 'pipeline', produces: [] } },
          next_eligible: [],
        }) as unknown as ReturnType<InstanceType<typeof StateManager>['loadState']>,
      ),
      markSkipped: vi.fn(),
      reconcileWithPipeline: vi.fn(() => false),
    }) as unknown as InstanceType<typeof StateManager>)

    const argv = {
      step: 'missing-step',
      reason: undefined,
      format: undefined,
      auto: undefined,
      verbose: undefined,
      root: undefined,
      force: undefined,
    }
    await skipCommand.handler(argv as Parameters<typeof skipCommand.handler>[0])

    expect(process.exitCode).toBe(2)
    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('DEP_TARGET_MISSING')
  })

  // Test 4: Step not found includes fuzzy suggestion
  it('step not found includes fuzzy suggestion when close match exists', async () => {
    mockFindClosestMatch.mockReturnValue('existing-step')

    MockStateManager.mockImplementation(() => ({
      loadState: vi.fn(() =>
        makeState({
          steps: { 'existing-step': { status: 'pending', source: 'pipeline', produces: [] } },
          next_eligible: [],
        }) as unknown as ReturnType<InstanceType<typeof StateManager>['loadState']>,
      ),
      markSkipped: vi.fn(),
      reconcileWithPipeline: vi.fn(() => false),
    }) as unknown as InstanceType<typeof StateManager>)

    const argv = {
      step: 'existin-step',
      reason: undefined,
      format: undefined,
      auto: undefined,
      verbose: undefined,
      root: undefined,
      force: undefined,
    }
    await skipCommand.handler(argv as Parameters<typeof skipCommand.handler>[0])

    expect(process.exitCode).toBe(2)
    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('existing-step')
  })

  // Test 5: Already completed exits 3 in json mode (PSM_INVALID_TRANSITION)
  it('already completed exits 3 in json mode without --force', async () => {
    mockResolveOutputMode.mockReturnValue('json')

    MockStateManager.mockImplementation(() => ({
      loadState: vi.fn(() =>
        makeState({
          steps: {
            'completed-step': { status: 'completed', source: 'pipeline', produces: [] },
          },
          next_eligible: [],
        }) as unknown as ReturnType<InstanceType<typeof StateManager>['loadState']>,
      ),
      markSkipped: vi.fn(),
      reconcileWithPipeline: vi.fn(() => false),
    }) as unknown as InstanceType<typeof StateManager>)

    const argv = {
      step: 'completed-step',
      reason: undefined,
      format: 'json',
      auto: undefined,
      verbose: undefined,
      root: undefined,
      force: undefined,
    }
    await skipCommand.handler(argv as Parameters<typeof skipCommand.handler>[0])

    expect(process.exitCode).toBe(3)
    const stderrOutput = stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('')
    expect(stderrOutput).toContain('PSM_INVALID_TRANSITION')
  })

  // Test 6: Already completed prompts confirm in interactive mode
  it('already completed prompts confirm in interactive mode and proceeds if confirmed', async () => {
    mockResolveOutputMode.mockReturnValue('interactive')

    const mockMarkSkipped = vi.fn()
    MockStateManager.mockImplementation(() => ({
      loadState: vi.fn(() =>
        makeState({
          steps: {
            'completed-step': { status: 'completed', source: 'pipeline', produces: [] },
          },
          next_eligible: [],
        }) as unknown as ReturnType<InstanceType<typeof StateManager>['loadState']>,
      ),
      markSkipped: mockMarkSkipped,
      reconcileWithPipeline: vi.fn(() => false),
    }) as unknown as InstanceType<typeof StateManager>)

    // Spy on createOutputContext to inject our confirm mock
    const contextModule = await import('../output/context.js')
    const mockConfirm = vi.fn().mockResolvedValue(true)
    vi.spyOn(contextModule, 'createOutputContext').mockReturnValue({
      success: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      result: vi.fn(),
      supportsInteractivePrompts: vi.fn().mockReturnValue(false),
      prompt: vi.fn(),
      confirm: mockConfirm,
      select: vi.fn(),
      multiSelect: vi.fn(),
      multiInput: vi.fn(),
      startSpinner: vi.fn(),
      stopSpinner: vi.fn(),
      startProgress: vi.fn(),
      updateProgress: vi.fn(),
      stopProgress: vi.fn(),
    })

    const argv = {
      step: 'completed-step',
      reason: undefined,
      format: undefined,
      auto: undefined,
      verbose: undefined,
      root: undefined,
      force: undefined,
    }
    await skipCommand.handler(argv as Parameters<typeof skipCommand.handler>[0])

    expect(mockConfirm).toHaveBeenCalled()
    expect(mockMarkSkipped).toHaveBeenCalledWith('completed-step', 'user-requested', 'scaffold-skip')
    expect(process.exitCode).toBe(0)

    vi.mocked(contextModule.createOutputContext).mockRestore()
  })

  // Test 7: Already skipped shows info and exits 0
  it('already skipped shows info and exits 0', async () => {
    MockStateManager.mockImplementation(() => ({
      loadState: vi.fn(() =>
        makeState({
          steps: {
            'skipped-step': { status: 'skipped', source: 'pipeline', produces: [], reason: 'not needed' },
          },
          next_eligible: [],
        }) as unknown as ReturnType<InstanceType<typeof StateManager>['loadState']>,
      ),
      markSkipped: vi.fn(),
      reconcileWithPipeline: vi.fn(() => false),
    }) as unknown as InstanceType<typeof StateManager>)

    const argv = {
      step: 'skipped-step',
      reason: undefined,
      format: undefined,
      auto: undefined,
      verbose: undefined,
      root: undefined,
      force: undefined,
    }
    await skipCommand.handler(argv as Parameters<typeof skipCommand.handler>[0])

    expect(process.exitCode).toBe(0)
    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('already skipped')
  })

  // Test 8: in_progress step triggers warning
  it('in_progress step triggers a warning before skipping', async () => {
    const mockMarkSkipped = vi.fn()
    MockStateManager.mockImplementation(() => ({
      loadState: vi.fn(() =>
        makeState({
          steps: {
            'active-step': { status: 'in_progress', source: 'pipeline', produces: [] },
          },
          next_eligible: [],
        }) as unknown as ReturnType<InstanceType<typeof StateManager>['loadState']>,
      ),
      markSkipped: mockMarkSkipped,
      reconcileWithPipeline: vi.fn(() => false),
    }) as unknown as InstanceType<typeof StateManager>)

    const argv = {
      step: 'active-step',
      reason: undefined,
      format: undefined,
      auto: undefined,
      verbose: undefined,
      root: undefined,
      force: undefined,
    }
    await skipCommand.handler(argv as Parameters<typeof skipCommand.handler>[0])

    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('in progress')
    expect(mockMarkSkipped).toHaveBeenCalled()
    expect(process.exitCode).toBe(0)
  })

  // Test 9: JSON output has step, reason, skippedAt, newly_eligible fields
  it('JSON output has step, reason, skippedAt, newly_eligible fields', async () => {
    mockResolveOutputMode.mockReturnValue('json')

    MockStateManager.mockImplementation(() => ({
      loadState: vi.fn(() =>
        makeState({
          steps: {
            'my-step': { status: 'pending', source: 'pipeline', produces: [] },
          },
          next_eligible: ['next-step'],
        }) as unknown as ReturnType<InstanceType<typeof StateManager>['loadState']>,
      ),
      markSkipped: vi.fn(),
      reconcileWithPipeline: vi.fn(() => false),
    }) as unknown as InstanceType<typeof StateManager>)

    const argv = {
      step: 'my-step',
      reason: 'not needed',
      format: 'json',
      auto: undefined,
      verbose: undefined,
      root: undefined,
      force: undefined,
    }
    await skipCommand.handler(argv as Parameters<typeof skipCommand.handler>[0])

    const allOutput = writtenLines.join('')
    const parsed = JSON.parse(allOutput)
    // JsonOutput wraps in { success: true, data: ... }
    const data = parsed.data ?? parsed
    expect(data).toHaveProperty('step', 'my-step')
    expect(data).toHaveProperty('reason', 'not needed')
    expect(data).toHaveProperty('skippedAt')
    expect(data).toHaveProperty('newly_eligible')
    expect(Array.isArray(data.newly_eligible)).toBe(true)
    expect(process.exitCode).toBe(0)

    // Silence unused variable warnings
    void stdoutSpy
    void mockAcquireLock
    void releaseLock
    void getLockPath
  })

  // -------------------------------------------------------------------------
  // Batch skip tests
  // -------------------------------------------------------------------------

  describe('batch skip (multiple steps)', () => {
    it('skips multiple steps in one invocation', async () => {
      const mockMarkSkipped = vi.fn()
      MockStateManager.mockImplementation(() => ({
        loadState: vi.fn(() =>
          makeState({
            steps: {
              'step-a': { status: 'pending', source: 'pipeline', produces: [] },
              'step-b': { status: 'pending', source: 'pipeline', produces: [] },
            },
            next_eligible: [],
          }) as unknown as ReturnType<InstanceType<typeof StateManager>['loadState']>,
        ),
        markSkipped: mockMarkSkipped,
        reconcileWithPipeline: vi.fn(() => false),
      }) as unknown as InstanceType<typeof StateManager>)

      const argv = {
        step: ['step-a', 'step-b'],
        reason: 'no frontend',
        format: undefined,
        auto: undefined,
        verbose: undefined,
        root: undefined,
        force: undefined,
      }
      await skipCommand.handler(argv as Parameters<typeof skipCommand.handler>[0])

      expect(mockMarkSkipped).toHaveBeenCalledTimes(2)
      expect(mockMarkSkipped).toHaveBeenCalledWith('step-a', 'no frontend', 'scaffold-skip')
      expect(mockMarkSkipped).toHaveBeenCalledWith('step-b', 'no frontend', 'scaffold-skip')
      expect(process.exitCode).toBe(0)
    })

    it('continues skipping remaining steps when one is not found', async () => {
      const mockMarkSkipped = vi.fn()
      MockStateManager.mockImplementation(() => ({
        loadState: vi.fn(() =>
          makeState({
            steps: {
              'good-step': { status: 'pending', source: 'pipeline', produces: [] },
            },
            next_eligible: [],
          }) as unknown as ReturnType<InstanceType<typeof StateManager>['loadState']>,
        ),
        markSkipped: mockMarkSkipped,
        reconcileWithPipeline: vi.fn(() => false),
      }) as unknown as InstanceType<typeof StateManager>)

      const argv = {
        step: ['bad-step', 'good-step'],
        reason: undefined,
        format: undefined,
        auto: undefined,
        verbose: undefined,
        root: undefined,
        force: undefined,
      }
      await skipCommand.handler(argv as Parameters<typeof skipCommand.handler>[0])

      // Should still skip the valid step
      expect(mockMarkSkipped).toHaveBeenCalledWith('good-step', 'user-requested', 'scaffold-skip')
      // Should exit with partial failure code
      expect(process.exitCode).toBe(2)
    })

    it('batch skip JSON output includes results array', async () => {
      mockResolveOutputMode.mockReturnValue('json')

      const mockMarkSkipped = vi.fn()
      MockStateManager.mockImplementation(() => ({
        loadState: vi.fn(() =>
          makeState({
            steps: {
              'step-a': { status: 'pending', source: 'pipeline', produces: [] },
              'step-b': { status: 'pending', source: 'pipeline', produces: [] },
            },
            next_eligible: ['next-step'],
          }) as unknown as ReturnType<InstanceType<typeof StateManager>['loadState']>,
        ),
        markSkipped: mockMarkSkipped,
        reconcileWithPipeline: vi.fn(() => false),
      }) as unknown as InstanceType<typeof StateManager>)

      const argv = {
        step: ['step-a', 'step-b'],
        reason: 'not needed',
        format: 'json',
        auto: undefined,
        verbose: undefined,
        root: undefined,
        force: undefined,
      }
      await skipCommand.handler(argv as Parameters<typeof skipCommand.handler>[0])

      const allOutput = writtenLines.join('')
      const parsed = JSON.parse(allOutput)
      const data = parsed.data ?? parsed
      expect(data).toHaveProperty('results')
      expect(Array.isArray(data.results)).toBe(true)
      expect(data.results).toHaveLength(2)
      expect(data.results[0]).toHaveProperty('step', 'step-a')
      expect(data.results[1]).toHaveProperty('step', 'step-b')
      expect(data).toHaveProperty('newly_eligible')
    })
  })
})
