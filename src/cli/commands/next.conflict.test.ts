import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../middleware/project-root.js', () => ({ findProjectRoot: vi.fn() }))
vi.mock('../middleware/output-mode.js', () => ({ resolveOutputMode: vi.fn(() => 'interactive') }))
vi.mock('../../config/loader.js', () => ({
  loadConfig: vi.fn(() => ({
    config: { version: 2, methodology: 'deep', platforms: ['claude-code'], project: { projectType: 'web-app' } },
    errors: [], warnings: [],
  })),
}))
vi.mock('../../state/state-manager.js', () => ({ StateManager: vi.fn() }))
vi.mock('../../core/assembly/meta-prompt-loader.js', () => ({ discoverMetaPrompts: vi.fn(() => new Map()) }))
vi.mock('../../core/assembly/preset-loader.js', () => ({
  loadAllPresets: vi.fn(() => ({ deep: null, mvp: null, custom: null, brownfield: null, errors: [], warnings: [] })),
}))
vi.mock('../../core/assembly/overlay-state-resolver.js', () => ({
  resolveOverlayState: vi.fn(() => ({
    steps: { beads: { enabled: true } }, knowledge: {}, reads: {}, dependencies: {}, crossReads: {},
  })),
}))
vi.mock('../../core/assembly/cross-reads.js', () => ({
  resolveCrossReadReadiness: vi.fn(() => []),
  humanCrossReadStatus: (s: string): string => s,
}))
vi.mock('../../core/dependency/graph.js', () => ({
  buildGraph: vi.fn(() => ({ nodes: new Map(), edges: new Map() })),
}))
vi.mock('../../core/dependency/eligibility.js', () => ({ computeEligible: vi.fn(() => []) }))

import { findProjectRoot } from '../middleware/project-root.js'
import { StateManager } from '../../state/state-manager.js'
import { computeEligible } from '../../core/dependency/eligibility.js'
import nextCommand from './next.js'

type NextArgv = Parameters<typeof nextCommand.handler>[0]

function makeState(steps: Record<string, unknown>): Record<string, unknown> {
  return {
    'schema-version': 1, 'scaffold-version': '2.0.0',
    init_methodology: 'deep', config_methodology: 'deep', 'init-mode': 'greenfield',
    created: '2024-01-01T00:00:00.000Z', in_progress: null,
    steps, next_eligible: [], 'extra-steps': [],
  }
}

describe('next — conflict overrides completed (D3)', () => {
  let stderrLines: string[]

  beforeEach(() => {
    stderrLines = []
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrLines.push(String(chunk))
      return true
    })
    vi.mocked(findProjectRoot).mockReturnValue('/fake/project')
    type LoadReturn = ReturnType<InstanceType<typeof StateManager>['loadState']>
    vi.mocked(StateManager).mockImplementation(() => ({
      loadState: vi.fn(() => makeState({
        beads: { status: 'completed', source: 'pipeline', produces: ['.beads/'], verification: 'declared' },
      }) as unknown as LoadReturn),
      reconcileWithPipeline: vi.fn(() => false),
    }) as unknown as InstanceType<typeof StateManager>)
  })

  afterEach(() => { vi.restoreAllMocks() })

  it('warns about the demoted step and computes eligibility from the overridden record', async () => {
    await nextCommand.handler({
      count: undefined, format: undefined, auto: undefined,
      root: undefined, verbose: undefined, force: undefined,
    } as NextArgv)
    expect(stderrLines.join('')).toContain('treated as not completed')
    const lastCall = vi.mocked(computeEligible).mock.calls.at(-1)
    expect((lastCall?.[1] as Record<string, { status: string }>)['beads'].status).toBe('pending')
  })
})
