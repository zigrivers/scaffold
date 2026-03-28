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

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { StateManager } from '../../state/state-manager.js'
import { discoverMetaPrompts } from '../../core/assembly/meta-prompt-loader.js'
import { buildGraph } from '../../core/dependency/graph.js'
import { computeEligible } from '../../core/dependency/eligibility.js'
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
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

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
})
