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

vi.mock('../../config/loader.js', () => ({
  loadConfig: vi.fn(() => ({ config: null, errors: [], warnings: [] })),
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
    reconcileWithPipeline: vi.fn(() => false),
  })),
}))

vi.mock('../../core/assembly/meta-prompt-loader.js', () => ({
  discoverMetaPrompts: vi.fn(() => new Map()),
}))

vi.mock('../../core/dependency/graph.js', () => ({
  buildGraph: vi.fn(() => ({ nodes: new Map(), edges: new Map() })),
}))

vi.mock('../../core/dependency/eligibility.js', () => ({
  computeEligible: vi.fn(() => []),
}))

vi.mock('../../core/pipeline/resolver.js', async () => {
  const actual = await vi.importActual<typeof import('../../core/pipeline/resolver.js')>(
    '../../core/pipeline/resolver.js',
  )
  return {
    ...actual,
    resolvePipeline: vi.fn(actual.resolvePipeline),
  }
})

vi.mock('../../core/assembly/overlay-state-resolver.js', () => ({
  resolveOverlayState: vi.fn((opts: {
    presetSteps: Record<string, unknown>
    metaPrompts: Map<string, { frontmatter: { crossReads?: Array<{ service: string; step: string }> } }>
  }) => {
    // Mirror the real resolveOverlayState behavior: populate crossReads per-step
    // from frontmatter. Tests that need overlay-level overrides use
    // mockReturnValueOnce to override this default.
    const crossReads: Record<string, Array<{ service: string; step: string }>> = {}
    for (const [name, mp] of opts.metaPrompts) {
      crossReads[name] = [...(mp.frontmatter.crossReads ?? [])]
    }
    return {
      steps: opts.presetSteps,
      knowledge: {},
      reads: {},
      dependencies: {},
      crossReads,
    }
  }),
}))

vi.mock('../../core/assembly/cross-reads.js', () => ({
  resolveCrossReadReadiness: vi.fn(() => []),
  humanCrossReadStatus: (s: string): string => {
    // Match real impl — keeps command output tests meaningful
    switch (s) {
    case 'not-bootstrapped': return 'service not bootstrapped'
    case 'service-unknown': return 'service unknown'
    case 'not-exported': return 'not exported'
    default: return s
    }
  },
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { loadConfig } from '../../config/loader.js'
import { StateManager } from '../../state/state-manager.js'
import { discoverMetaPrompts } from '../../core/assembly/meta-prompt-loader.js'
import { resolveOverlayState } from '../../core/assembly/overlay-state-resolver.js'
import { buildGraph } from '../../core/dependency/graph.js'
import { computeEligible } from '../../core/dependency/eligibility.js'
import { resolveCrossReadReadiness } from '../../core/assembly/cross-reads.js'
import { resolvePipeline } from '../../core/pipeline/resolver.js'
import nextCommand from './next.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type NextArgv = Parameters<typeof nextCommand.handler>[0]

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

function defaultArgv(overrides: Partial<NextArgv> = {}): NextArgv {
  return {
    count: undefined,
    format: undefined,
    auto: undefined,
    root: undefined,
    verbose: undefined,
    force: undefined,
    ...overrides,
  } as NextArgv
}

function mockStateWith(
  MockSM: ReturnType<typeof vi.mocked<typeof StateManager>>,
  steps: Record<string, unknown>,
): void {
  type LoadReturn = ReturnType<InstanceType<typeof StateManager>['loadState']>
  MockSM.mockImplementation(() => ({
    loadState: vi.fn(
      () => makeState({ steps }) as unknown as LoadReturn,
    ),
    reconcileWithPipeline: vi.fn(() => false),
  }) as unknown as InstanceType<typeof StateManager>)
}

function makeFrontmatter(name: string, description: string, phase = 'pre', order = 1) {
  return {
    frontmatter: {
      name,
      description,
      phase,
      order,
      dependencies: [],
      outputs: [],
      conditional: null,
      knowledgeBase: [],
      reads: [],
    },
    stepName: name,
    filePath: `/fake/${name}.md`,
    body: '',
    sections: {},
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('next command', () => {
  let exitSpy: MockInstance
  let writtenLines: string[]

  const mockFindProjectRoot = vi.mocked(findProjectRoot)
  const mockResolveOutputMode = vi.mocked(resolveOutputMode)
  const MockStateManager = vi.mocked(StateManager)
  const mockDiscoverMetaPrompts = vi.mocked(discoverMetaPrompts)
  const mockBuildGraph = vi.mocked(buildGraph)
  const mockComputeEligible = vi.mocked(computeEligible)

  beforeEach(() => {
    writtenLines = []
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writtenLines.push(String(chunk))
      return true
    })
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      writtenLines.push(String(chunk))
      return true
    })

    mockResolveOutputMode.mockReturnValue('interactive')
    mockFindProjectRoot.mockReturnValue('/fake/project')
    mockDiscoverMetaPrompts.mockReturnValue(new Map())
    mockBuildGraph.mockReturnValue({ nodes: new Map(), edges: new Map() })
    mockComputeEligible.mockReturnValue([])
    type LoadReturn = ReturnType<InstanceType<typeof StateManager>['loadState']>
    MockStateManager.mockImplementation(() => ({
      loadState: vi.fn(
        () => makeState() as unknown as LoadReturn,
      ),
      reconcileWithPipeline: vi.fn(() => false),
    }) as unknown as InstanceType<typeof StateManager>)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exits 1 when project root not found', async () => {
    mockFindProjectRoot.mockReturnValue(null)
    await nextCommand.handler(defaultArgv())
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('shows "Pipeline complete!" when all steps are completed or skipped', async () => {
    const steps = {
      'step-a': { status: 'completed', source: 'pipeline', produces: [] },
      'step-b': { status: 'skipped', source: 'pipeline', produces: [] },
    }
    mockStateWith(MockStateManager, steps)
    mockComputeEligible.mockReturnValue([])
    await nextCommand.handler(defaultArgv())
    expect(writtenLines.join('')).toContain('Pipeline complete!')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('lists eligible steps with "scaffold run <slug>" format', async () => {
    const steps = {
      'step-a': { status: 'completed', source: 'pipeline', produces: [] },
      'step-b': { status: 'pending', source: 'pipeline', produces: [] },
      'step-c': { status: 'pending', source: 'pipeline', produces: [] },
    }
    mockStateWith(MockStateManager, steps)
    mockComputeEligible.mockReturnValue(['step-b', 'step-c'])
    const metaPrompts = new Map([
      ['step-b', makeFrontmatter('step-b', 'Step B description', 'pre', 2)],
      ['step-c', makeFrontmatter('step-c', 'Step C description', 'pre', 3)],
    ])
    mockDiscoverMetaPrompts.mockReturnValue(
      metaPrompts as unknown as ReturnType<typeof discoverMetaPrompts>,
    )
    await nextCommand.handler(defaultArgv())
    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('scaffold run step-b')
    expect(allOutput).toContain('scaffold run step-c')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('--count 2 limits output to 2 eligible steps', async () => {
    const steps = {
      's1': { status: 'pending', source: 'pipeline', produces: [] },
      's2': { status: 'pending', source: 'pipeline', produces: [] },
      's3': { status: 'pending', source: 'pipeline', produces: [] },
      's4': { status: 'pending', source: 'pipeline', produces: [] },
    }
    mockStateWith(MockStateManager, steps)
    mockComputeEligible.mockReturnValue(['s1', 's2', 's3', 's4'])
    await nextCommand.handler(defaultArgv({ count: 2 }))
    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('scaffold run s1')
    expect(allOutput).toContain('scaffold run s2')
    expect(allOutput).not.toContain('scaffold run s3')
    expect(allOutput).not.toContain('scaffold run s4')
  })

  it('JSON mode returns NextResult with eligible array', async () => {
    mockResolveOutputMode.mockReturnValue('json')
    const steps = {
      'step-a': { status: 'pending', source: 'pipeline', produces: [] },
      'step-b': { status: 'pending', source: 'pipeline', produces: [] },
    }
    mockStateWith(MockStateManager, steps)
    mockComputeEligible.mockReturnValue(['step-a', 'step-b'])
    const metaPrompts = new Map([
      ['step-a', makeFrontmatter('step-a', 'First step', 'pre', 1)],
      ['step-b', makeFrontmatter('step-b', 'Second step', 'pre', 2)],
    ])
    mockDiscoverMetaPrompts.mockReturnValue(
      metaPrompts as unknown as ReturnType<typeof discoverMetaPrompts>,
    )
    await nextCommand.handler(defaultArgv({ format: 'json' }))
    const envelope = JSON.parse(writtenLines.join(''))
    const parsed = envelope.data ?? envelope
    expect(parsed).toHaveProperty('eligible')
    expect(parsed).toHaveProperty('blocked_steps')
    expect(parsed).toHaveProperty('pipeline_complete')
    expect(Array.isArray(parsed.eligible)).toBe(true)
    expect(parsed.eligible).toHaveLength(2)
    expect(parsed.eligible[0]).toMatchObject({
      slug: 'step-a',
      command: 'scaffold run step-a',
    })
    expect(parsed.eligible[1]).toMatchObject({
      slug: 'step-b',
      command: 'scaffold run step-b',
    })
    expect(parsed.pipeline_complete).toBe(false)
  })

  it('shows warning when no eligible steps but pipeline is not complete', async () => {
    const steps = {
      'step-a': { status: 'in_progress', source: 'pipeline', produces: [] },
      'step-b': { status: 'pending', source: 'pipeline', produces: [] },
    }
    mockStateWith(MockStateManager, steps)
    mockComputeEligible.mockReturnValue([])
    await nextCommand.handler(defaultArgv())
    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('No eligible steps')
    expect(allOutput).not.toContain('Pipeline complete!')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('JSON output always includes blocked_steps as an array', async () => {
    mockResolveOutputMode.mockReturnValue('json')
    mockComputeEligible.mockReturnValue([])
    await nextCommand.handler(defaultArgv({ format: 'json' }))
    const envelope = JSON.parse(writtenLines.join(''))
    const parsed = envelope.data ?? envelope
    expect(parsed).toHaveProperty('blocked_steps')
    expect(Array.isArray(parsed.blocked_steps)).toBe(true)
  })

  it('suggests a game step when config has projectType: game and prerequisites met', async () => {
    const mockLoadConfig = vi.mocked(loadConfig)
    const mockOverlay = vi.mocked(resolveOverlayState)

    // Config with projectType: 'game'
    mockLoadConfig.mockReturnValue({
      config: {
        version: 2,
        methodology: 'deep',
        platforms: ['claude-code'],
        project: { projectType: 'game' },
      } as ReturnType<typeof loadConfig>['config'],
      errors: [],
      warnings: [],
    })

    // Overlay returns game-design-document as enabled
    mockOverlay.mockReturnValue({
      steps: {
        'game-design-document': { enabled: true },
        'requirements': { enabled: true },
      },
      knowledge: {},
      reads: {},
      dependencies: {},
      crossReads: {},
    })

    const metaPrompts = new Map([
      ['game-design-document', makeFrontmatter('game-design-document', 'Game design document', 'design', 1)],
      ['requirements', makeFrontmatter('requirements', 'Requirements', 'pre', 1)],
    ])
    mockDiscoverMetaPrompts.mockReturnValue(
      metaPrompts as unknown as ReturnType<typeof discoverMetaPrompts>,
    )

    const steps = {
      'game-design-document': { status: 'pending', source: 'pipeline', produces: [] },
      'requirements': { status: 'completed', source: 'pipeline', produces: [] },
    }
    mockStateWith(MockStateManager, steps)
    mockComputeEligible.mockReturnValue(['game-design-document'])

    await nextCommand.handler(defaultArgv())

    // Verify overlay was called with the config
    expect(mockOverlay).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          project: expect.objectContaining({ projectType: 'game' }),
        }),
      }),
    )

    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('scaffold run game-design-document')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  describe('cross-dep readiness (Wave 3c)', () => {
    const mockOverlay = vi.mocked(resolveOverlayState)
    const mockCrossRead = vi.mocked(resolveCrossReadReadiness)

    function stepWithCrossReads() {
      return {
        frontmatter: {
          name: 'system-architecture',
          description: 'Arch',
          phase: 'architecture',
          order: 700,
          dependencies: [],
          outputs: ['docs/arch.md'],
          conditional: null,
          knowledgeBase: [],
          reads: [],
          crossReads: [{ service: 'shared-lib', step: 'api-contracts' }],
          stateless: false,
          category: 'pipeline' as const,
        },
        stepName: 'system-architecture',
        filePath: '/fake/sa.md',
        body: '',
        sections: {},
      }
    }

    it('JSON output includes crossDependencies on eligible steps', async () => {
      mockResolveOutputMode.mockReturnValue('json')
      vi.mocked(loadConfig).mockReturnValue({
        config: {
          version: 2, methodology: 'deep', platforms: ['claude-code'],
          project: {
            services: [
              {
                name: 'api',
                projectType: 'backend',
                backendConfig: { apiStyle: 'rest' },
              },
              {
                name: 'shared-lib',
                projectType: 'library',
                libraryConfig: { visibility: 'internal' },
                exports: [{ step: 'api-contracts' }],
              },
            ],
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        errors: [], warnings: [],
      })
      mockDiscoverMetaPrompts.mockReturnValue(new Map([
        ['system-architecture', stepWithCrossReads()],
      ]))
      mockComputeEligible.mockReturnValue(['system-architecture'])
      mockOverlay.mockReturnValue({
        steps: {},
        knowledge: {},
        reads: {},
        dependencies: {},
        // Cross-dep consumer lookup now reads from overlay.crossReads directly
        // (no frontmatter fallback since Wave 3c+1 cleanup). Populate to match the
        // step's frontmatter crossReads.
        crossReads: {
          'system-architecture': [{ service: 'shared-lib', step: 'api-contracts' }],
        },
      })
      mockCrossRead.mockReturnValue([
        { service: 'shared-lib', step: 'api-contracts', status: 'completed' },
      ])

      await nextCommand.handler(defaultArgv({ service: 'api' } as Partial<NextArgv>))

      const envelope = JSON.parse(writtenLines.join(''))
      expect(envelope.data.eligible[0].crossDependencies).toEqual([
        { service: 'shared-lib', step: 'api-contracts', status: 'completed' },
      ])
      expect(mockCrossRead).toHaveBeenCalledWith(
        [{ service: 'shared-lib', step: 'api-contracts' }],
        expect.anything(),  // config
        expect.any(String), // projectRoot
        expect.any(Set),    // globalSteps (Wave 3c runtime guard)
        expect.any(Map),    // sharedForeignCache (hoisted per invocation)
      )
    })

    it('text output annotates eligible steps with cross-dep readiness', async () => {
      mockResolveOutputMode.mockReturnValue('interactive')
      vi.mocked(loadConfig).mockReturnValue({
        config: {
          version: 2, methodology: 'deep', platforms: ['claude-code'],
          project: {
            services: [
              {
                name: 'api',
                projectType: 'backend',
                backendConfig: { apiStyle: 'rest' },
              },
              {
                name: 'shared-lib',
                projectType: 'library',
                libraryConfig: { visibility: 'internal' },
                exports: [{ step: 'api-contracts' }],
              },
            ],
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        errors: [], warnings: [],
      })
      mockDiscoverMetaPrompts.mockReturnValue(new Map([
        ['system-architecture', stepWithCrossReads()],
      ]))
      mockComputeEligible.mockReturnValue(['system-architecture'])
      mockOverlay.mockReturnValue({
        steps: {},
        knowledge: {},
        reads: {},
        dependencies: {},
        // Cross-dep consumer lookup now reads from overlay.crossReads directly
        // (no frontmatter fallback since Wave 3c+1 cleanup). Populate to match the
        // step's frontmatter crossReads.
        crossReads: {
          'system-architecture': [{ service: 'shared-lib', step: 'api-contracts' }],
        },
      })
      mockCrossRead.mockReturnValue([
        { service: 'shared-lib', step: 'api-contracts', status: 'completed' },
      ])

      await nextCommand.handler(defaultArgv({ service: 'api' } as Partial<NextArgv>))

      const out = writtenLines.join('')
      expect(out).toMatch(/cross-reads shared-lib:api-contracts \(completed\)/)
    })

    it('text output uses human-facing strings for non-completed statuses', async () => {
      mockResolveOutputMode.mockReturnValue('interactive')
      vi.mocked(loadConfig).mockReturnValue({
        config: {
          version: 2, methodology: 'deep', platforms: ['claude-code'],
          project: {
            services: [
              { name: 'api', projectType: 'backend', backendConfig: { apiStyle: 'rest' } },
            ],
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        errors: [], warnings: [],
      })
      mockDiscoverMetaPrompts.mockReturnValue(new Map([
        ['system-architecture', stepWithCrossReads()],
      ]))
      mockComputeEligible.mockReturnValue(['system-architecture'])
      mockOverlay.mockReturnValue({
        steps: {},
        knowledge: {},
        reads: {},
        dependencies: {},
        // Cross-dep consumer lookup now reads from overlay.crossReads directly
        // (no frontmatter fallback since Wave 3c+1 cleanup). Populate to match the
        // step's frontmatter crossReads.
        crossReads: {
          'system-architecture': [{ service: 'shared-lib', step: 'api-contracts' }],
        },
      })
      mockCrossRead.mockReturnValue([
        { service: 'shared-lib', step: 'api-contracts', status: 'not-bootstrapped' },
      ])

      await nextCommand.handler(defaultArgv({ service: 'api' } as Partial<NextArgv>))

      const out = writtenLines.join('')
      // Human-facing string, not raw enum
      expect(out).toMatch(/\(service not bootstrapped\)/)
      expect(out).not.toMatch(/\(not-bootstrapped\)/)
    })
  })

  it('uses readEligible cache when hash+counter match (skips live computeEligible)', async () => {
    const cachedEligible = ['cached-step-x', 'cached-step-y']
    type LoadReturn = ReturnType<InstanceType<typeof StateManager>['loadState']>
    MockStateManager.mockImplementation(() => ({
      loadState: vi.fn(() => makeState({
        steps: {
          'cached-step-x': { status: 'pending', source: 'pipeline', produces: [] },
        },
        next_eligible: cachedEligible,
        next_eligible_hash: 'test-hash-v1',
      }) as unknown as LoadReturn),
      reconcileWithPipeline: vi.fn(() => false),
    }) as unknown as InstanceType<typeof StateManager>)
    mockComputeEligible.mockReturnValue(['should-not-appear'])

    vi.mocked(resolvePipeline).mockReturnValueOnce({
      graph: { nodes: new Map(), edges: new Map() },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      preset: {} as any,
      overlay: {
        steps: {},
        knowledge: {},
        reads: {},
        dependencies: {},
        crossReads: {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      stepMeta: new Map([
        ['cached-step-x', makeFrontmatter('cached-step-x', 'desc', 'pre', 1).frontmatter],
        ['cached-step-y', makeFrontmatter('cached-step-y', 'desc', 'pre', 2).frontmatter],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ]) as any,
      computeEligible: mockComputeEligible as unknown as ReturnType<
        typeof resolvePipeline
      >['computeEligible'],
      globalSteps: new Set(),
      getPipelineHash: vi.fn((_scope) => 'test-hash-v1'),
    })

    const metaPrompts = new Map([
      ['cached-step-x', makeFrontmatter('cached-step-x', 'desc X', 'pre', 1)],
      ['cached-step-y', makeFrontmatter('cached-step-y', 'desc Y', 'pre', 2)],
    ])
    mockDiscoverMetaPrompts.mockReturnValue(
      metaPrompts as unknown as ReturnType<typeof discoverMetaPrompts>,
    )

    await nextCommand.handler(defaultArgv())

    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('scaffold run cached-step-x')
    expect(allOutput).toContain('scaffold run cached-step-y')
    expect(allOutput).not.toContain('should-not-appear')
    expect(mockComputeEligible).not.toHaveBeenCalled()
  })

  it('falls back to live compute when hash mismatches', async () => {
    type LoadReturn = ReturnType<InstanceType<typeof StateManager>['loadState']>
    MockStateManager.mockImplementation(() => ({
      loadState: vi.fn(() => makeState({
        steps: {
          'any-step': { status: 'pending', source: 'pipeline', produces: [] },
        },
        next_eligible: ['stale-cached'],
        next_eligible_hash: 'OLD-HASH',
      }) as unknown as LoadReturn),
      reconcileWithPipeline: vi.fn(() => false),
    }) as unknown as InstanceType<typeof StateManager>)
    mockComputeEligible.mockReturnValue(['fresh-step'])
    vi.mocked(resolvePipeline).mockReturnValueOnce({
      graph: { nodes: new Map(), edges: new Map() },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      preset: {} as any,
      overlay: {
        steps: {},
        knowledge: {},
        reads: {},
        dependencies: {},
        crossReads: {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      stepMeta: new Map([
        ['fresh-step', makeFrontmatter('fresh-step', 'desc', 'pre', 1).frontmatter],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ]) as any,
      computeEligible: mockComputeEligible as unknown as ReturnType<
        typeof resolvePipeline
      >['computeEligible'],
      globalSteps: new Set(),
      getPipelineHash: vi.fn(() => 'NEW-HASH'),
    })
    mockDiscoverMetaPrompts.mockReturnValue(new Map([
      ['fresh-step', makeFrontmatter('fresh-step', 'desc', 'pre', 1)],
    ]) as unknown as ReturnType<typeof discoverMetaPrompts>)

    await nextCommand.handler(defaultArgv())

    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('scaffold run fresh-step')
    expect(allOutput).not.toContain('stale-cached')
    expect(mockComputeEligible).toHaveBeenCalled()
  })
})
