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

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { StateManager } from '../../state/state-manager.js'
import { discoverMetaPrompts } from '../../core/assembly/meta-prompt-loader.js'
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
})
