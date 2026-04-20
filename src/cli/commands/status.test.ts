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

vi.mock('../../core/assembly/preset-loader.js', () => ({
  loadAllPresets: vi.fn(() => ({
    deep: null,
    mvp: null,
    custom: null,
    errors: [],
    warnings: [],
  })),
}))

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
import { resolveCrossReadReadiness } from '../../core/assembly/cross-reads.js'
import { resolveOverlayState } from '../../core/assembly/overlay-state-resolver.js'
import statusCommand from './status.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StatusArgv = Parameters<typeof statusCommand.handler>[0]

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

function defaultArgv(overrides: Partial<StatusArgv> = {}): StatusArgv {
  return {
    phase: undefined,
    compact: undefined,
    format: undefined,
    auto: undefined,
    root: undefined,
    verbose: undefined,
    force: undefined,
    ...overrides,
  } as StatusArgv
}

function mockStateWith(
  MockSM: ReturnType<typeof vi.mocked<typeof StateManager>>,
  steps: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): void {
  type LoadReturn = ReturnType<InstanceType<typeof StateManager>['loadState']>
  MockSM.mockImplementation(() => ({
    loadState: vi.fn(
      () => makeState({ steps, ...overrides }) as unknown as LoadReturn,
    ),
    reconcileWithPipeline: vi.fn(() => false),
  }) as unknown as InstanceType<typeof StateManager>)
}

function makeFrontmatter(name: string, phase: string, order: number) {
  return {
    frontmatter: {
      name,
      description: '',
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

describe('status command', () => {
  let exitSpy: MockInstance
  let writtenLines: string[]

  const mockFindProjectRoot = vi.mocked(findProjectRoot)
  const mockResolveOutputMode = vi.mocked(resolveOutputMode)
  const MockStateManager = vi.mocked(StateManager)
  const mockDiscoverMetaPrompts = vi.mocked(discoverMetaPrompts)

  beforeEach(() => {
    writtenLines = []
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writtenLines.push(String(chunk))
      return true
    })
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    mockResolveOutputMode.mockReturnValue('interactive')
    mockFindProjectRoot.mockReturnValue('/fake/project')
    mockDiscoverMetaPrompts.mockReturnValue(new Map())
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
    await statusCommand.handler(defaultArgv())
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('outputs progress percentage to stdout', async () => {
    const steps = {
      'step-a': { status: 'completed', source: 'pipeline', produces: [] },
      'step-b': { status: 'completed', source: 'pipeline', produces: [] },
      'step-c': { status: 'pending', source: 'pipeline', produces: [] },
      'step-d': { status: 'pending', source: 'pipeline', produces: [] },
    }
    mockStateWith(MockStateManager, steps, { next_eligible: [] })
    await statusCommand.handler(defaultArgv())
    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('50%')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('shows correct status icons for completed and pending steps', async () => {
    const steps = {
      'step-a': { status: 'completed', source: 'pipeline', produces: [] },
      'step-b': { status: 'pending', source: 'pipeline', produces: [] },
    }
    mockStateWith(MockStateManager, steps, { next_eligible: [] })
    await statusCommand.handler(defaultArgv())
    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('✓')
    expect(allOutput).toContain('○')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('JSON mode returns correct StatusResult shape', async () => {
    mockResolveOutputMode.mockReturnValue('json')
    const steps = {
      'step-a': { status: 'completed', source: 'pipeline', produces: [] },
      'step-b': { status: 'skipped', source: 'pipeline', produces: [] },
      'step-c': { status: 'pending', source: 'pipeline', produces: [] },
      'step-d': { status: 'in_progress', source: 'pipeline', produces: [] },
    }
    mockStateWith(MockStateManager, steps, { next_eligible: ['step-c'] })
    await statusCommand.handler(defaultArgv({ format: 'json' }))
    const envelope = JSON.parse(writtenLines.join(''))
    const parsed = envelope.data ?? envelope
    expect(parsed).toHaveProperty('pipeline')
    expect(parsed).toHaveProperty('progress')
    expect(parsed).toHaveProperty('phases')
    expect(parsed).toHaveProperty('nextEligible')
    expect(parsed).toHaveProperty('orphaned_entries')
    expect(parsed.progress.completed).toBe(1)
    expect(parsed.progress.skipped).toBe(1)
    expect(parsed.progress.pending).toBe(1)
    expect(parsed.progress.inProgress).toBe(1)
    expect(parsed.progress.total).toBe(4)
    expect(parsed.progress.percentage).toBe(50)
    expect(Array.isArray(parsed.phases)).toBe(true)
    expect(Array.isArray(parsed.nextEligible)).toBe(true)
    expect(Array.isArray(parsed.orphaned_entries)).toBe(true)
  })

  it('--phase filter shows only steps matching that phase number', async () => {
    const metaPrompts = new Map([
      ['step-a', makeFrontmatter('step-a', '1', 1)],
      ['step-b', makeFrontmatter('step-b', '2', 2)],
    ])
    mockDiscoverMetaPrompts.mockReturnValue(
      metaPrompts as unknown as ReturnType<typeof discoverMetaPrompts>,
    )
    const steps = {
      'step-a': { status: 'completed', source: 'pipeline', produces: [] },
      'step-b': { status: 'pending', source: 'pipeline', produces: [] },
    }
    mockStateWith(MockStateManager, steps, { next_eligible: [] })
    await statusCommand.handler(defaultArgv({ phase: 1 }))
    const stepLines = writtenLines
      .join('')
      .split('\n')
      .filter(l => l.includes('[completed]') || l.includes('[pending]'))
    expect(stepLines.some(l => l.includes('step-a'))).toBe(true)
    expect(stepLines.some(l => l.includes('step-b'))).toBe(false)
  })

  it('shows next eligible steps', async () => {
    const steps = {
      'step-a': { status: 'completed', source: 'pipeline', produces: [] },
      'step-b': { status: 'pending', source: 'pipeline', produces: [] },
    }
    mockStateWith(MockStateManager, steps, { next_eligible: ['step-b'] })
    await statusCommand.handler(defaultArgv())
    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('step-b')
    expect(allOutput).toContain('Next eligible')
  })

  it('handles empty pipeline with 0% and shows none for next eligible', async () => {
    mockStateWith(MockStateManager, {}, { next_eligible: [] })
    await statusCommand.handler(defaultArgv())
    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('0%')
    expect(allOutput).toContain('none')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  it('calculates percentage: completed+skipped count, pending+in_progress do not', async () => {
    const steps = {
      's1': { status: 'completed', source: 'pipeline', produces: [] },
      's2': { status: 'completed', source: 'pipeline', produces: [] },
      's3': { status: 'completed', source: 'pipeline', produces: [] },
      's4': { status: 'skipped', source: 'pipeline', produces: [] },
      's5': { status: 'pending', source: 'pipeline', produces: [] },
      's6': { status: 'in_progress', source: 'pipeline', produces: [] },
    }
    mockStateWith(MockStateManager, steps, { next_eligible: [] })
    mockResolveOutputMode.mockReturnValue('json')
    await statusCommand.handler(defaultArgv({ format: 'json' }))
    const envelope = JSON.parse(writtenLines.join(''))
    const parsed = envelope.data ?? envelope
    expect(parsed.progress.percentage).toBe(67)
    expect(parsed.progress.completed).toBe(3)
    expect(parsed.progress.skipped).toBe(1)
    expect(parsed.progress.pending).toBe(1)
    expect(parsed.progress.inProgress).toBe(1)
    expect(parsed.progress.total).toBe(6)
  })

  it('calls reconcileWithPipeline to add new pipeline steps to state', async () => {
    const metaPrompts = new Map([
      ['step-a', makeFrontmatter('step-a', 'quality', 900)],
      ['step-b', makeFrontmatter('step-b', 'quality', 910)],
      ['story-tests', makeFrontmatter('story-tests', 'quality', 915)],
    ])
    mockDiscoverMetaPrompts.mockReturnValue(
      metaPrompts as unknown as ReturnType<typeof discoverMetaPrompts>,
    )

    // State only has step-a and step-b; story-tests is missing
    const steps = {
      'step-a': { status: 'completed', source: 'pipeline', produces: [] },
      'step-b': { status: 'pending', source: 'pipeline', produces: [] },
    }
    // Track reconcileWithPipeline calls
    const reconcileFn = vi.fn(() => false)
    type LoadReturn = ReturnType<InstanceType<typeof StateManager>['loadState']>
    MockStateManager.mockImplementation(() => ({
      loadState: vi.fn(
        () => makeState({ steps }) as unknown as LoadReturn,
      ),
      reconcileWithPipeline: reconcileFn,
    }) as unknown as InstanceType<typeof StateManager>)

    await statusCommand.handler(defaultArgv())

    // Verify reconcileWithPipeline was called with pipeline steps
    expect(reconcileFn).toHaveBeenCalledTimes(1)
    const pipelineArg = (reconcileFn.mock.calls[0] as unknown as [Array<{ slug: string }>])[0]
    const slugs = pipelineArg.map((s: { slug: string }) => s.slug)
    expect(slugs).toContain('story-tests')
    expect(slugs).toContain('step-a')
    expect(slugs).toContain('step-b')
  })

  it('uses overlay steps when config has projectType: game', async () => {
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
      ['game-design-document', makeFrontmatter('game-design-document', 'design', 1)],
      ['requirements', makeFrontmatter('requirements', 'design', 2)],
    ])
    mockDiscoverMetaPrompts.mockReturnValue(
      metaPrompts as unknown as ReturnType<typeof discoverMetaPrompts>,
    )

    const steps = {
      'game-design-document': { status: 'pending', source: 'pipeline', produces: [] },
      'requirements': { status: 'completed', source: 'pipeline', produces: [] },
    }
    mockStateWith(MockStateManager, steps, { next_eligible: ['game-design-document'] })

    await statusCommand.handler(defaultArgv())

    // Verify overlay was called with the config
    expect(mockOverlay).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          project: expect.objectContaining({ projectType: 'game' }),
        }),
      }),
    )

    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('game-design-document')
    expect(exitSpy).toHaveBeenCalledWith(0)
  })

  describe('--compact flag', () => {
    it('hides completed and skipped steps from detail list', async () => {
      const steps = {
        'done-step': { status: 'completed', source: 'pipeline', produces: [] },
        'skipped-step': { status: 'skipped', source: 'pipeline', produces: [] },
        'todo-step': { status: 'pending', source: 'pipeline', produces: [] },
        'active-step': { status: 'in_progress', source: 'pipeline', produces: [] },
      }
      mockStateWith(MockStateManager, steps, { next_eligible: ['todo-step'] })
      await statusCommand.handler(defaultArgv({ compact: true }))
      const allOutput = writtenLines.join('')
      expect(allOutput).not.toContain('done-step')
      expect(allOutput).not.toContain('skipped-step')
      expect(allOutput).toContain('todo-step')
      expect(allOutput).toContain('active-step')
    })

    it('shows summary counts in compact mode', async () => {
      const steps = {
        's1': { status: 'completed', source: 'pipeline', produces: [] },
        's2': { status: 'completed', source: 'pipeline', produces: [] },
        's3': { status: 'skipped', source: 'pipeline', produces: [] },
        's4': { status: 'pending', source: 'pipeline', produces: [] },
        's5': { status: 'in_progress', source: 'pipeline', produces: [] },
      }
      mockStateWith(MockStateManager, steps, { next_eligible: ['s4'] })
      await statusCommand.handler(defaultArgv({ compact: true }))
      const allOutput = writtenLines.join('')
      // Summary line should show counts
      expect(allOutput).toContain('2 completed')
      expect(allOutput).toContain('1 skipped')
      expect(allOutput).toContain('1 pending')
      expect(allOutput).toContain('1 in progress')
    })

    it('compact JSON mode includes compact flag in output', async () => {
      mockResolveOutputMode.mockReturnValue('json')
      const steps = {
        'done': { status: 'completed', source: 'pipeline', produces: [] },
        'todo': { status: 'pending', source: 'pipeline', produces: [] },
      }
      mockStateWith(MockStateManager, steps, { next_eligible: ['todo'] })
      await statusCommand.handler(defaultArgv({ compact: true, format: 'json' }))
      const envelope = JSON.parse(writtenLines.join(''))
      const parsed = envelope.data ?? envelope
      expect(parsed.compact).toBe(true)
      // Compact JSON should only include actionable steps
      const stepSlugs = parsed.steps.map((s: { slug: string }) => s.slug)
      expect(stepSlugs).toContain('todo')
      expect(stepSlugs).not.toContain('done')
    })
  })

  describe('cross-dep readiness (Wave 3c)', () => {
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

    it('JSON output includes crossDependencies on actionable steps', async () => {
      mockResolveOutputMode.mockReturnValue('json')
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
      mockStateWith(MockStateManager, {
        'system-architecture': { status: 'pending', source: 'pipeline', produces: [] },
      })
      vi.mocked(resolveCrossReadReadiness).mockReturnValue([
        { service: 'shared-lib', step: 'api-contracts', status: 'pending' },
      ])

      await statusCommand.handler(defaultArgv({ service: 'api' }))

      const envelope = JSON.parse(writtenLines.join(''))
      const parsed = envelope.data ?? envelope
      const archStep = parsed.phases
        .flatMap((p: { steps: Array<{ slug: string; crossDependencies?: unknown }> }) => p.steps)
        .find((s: { slug: string }) => s.slug === 'system-architecture')
      expect(archStep?.crossDependencies).toEqual([
        { service: 'shared-lib', step: 'api-contracts', status: 'pending' },
      ])
    })

    it('compact JSON preserves crossDependencies on actionable steps', async () => {
      mockResolveOutputMode.mockReturnValue('json')
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
      mockStateWith(MockStateManager, {
        'system-architecture': { status: 'pending', source: 'pipeline', produces: [] },
      })
      vi.mocked(resolveCrossReadReadiness).mockReturnValue([
        { service: 'shared-lib', step: 'api-contracts', status: 'completed' },
      ])

      await statusCommand.handler(defaultArgv({ service: 'api', compact: true, format: 'json' }))

      const envelope = JSON.parse(writtenLines.join(''))
      const parsed = envelope.data ?? envelope
      expect(parsed.compact).toBe(true)
      const archStep = parsed.steps.find((s: { slug: string }) => s.slug === 'system-architecture')
      expect(archStep?.crossDependencies).toEqual([
        { service: 'shared-lib', step: 'api-contracts', status: 'completed' },
      ])
    })

    it('text output annotates actionable steps with readiness (human-facing strings)', async () => {
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
      mockStateWith(MockStateManager, {
        'system-architecture': { status: 'pending', source: 'pipeline', produces: [] },
      })
      vi.mocked(resolveCrossReadReadiness).mockReturnValue([
        { service: 'shared-lib', step: 'api-contracts', status: 'not-bootstrapped' },
      ])

      await statusCommand.handler(defaultArgv({ service: 'api' }))

      const out = writtenLines.join('')
      expect(out).toMatch(/cross-reads shared-lib:api-contracts \(service not bootstrapped\)/)
    })
  })
})
