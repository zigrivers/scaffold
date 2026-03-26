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
  loadConfig: vi.fn(),
}))

vi.mock('../../core/assembly/meta-prompt-loader.js', () => ({
  discoverMetaPrompts: vi.fn(),
}))

vi.mock('../../core/assembly/preset-loader.js', () => ({
  loadAllPresets: vi.fn(),
}))

vi.mock('../../core/dependency/graph.js', () => ({
  buildGraph: vi.fn(),
}))

vi.mock('../../core/dependency/dependency.js', () => ({
  detectCycles: vi.fn(() => []),
  topologicalSort: vi.fn(() => []),
}))

vi.mock('../../cli/output/error-display.js', () => ({
  displayErrors: vi.fn(),
}))

vi.mock('../../core/assembly/knowledge-loader.js', () => ({
  buildIndexWithOverrides: vi.fn(() => new Map()),
  loadFullEntries: vi.fn(() => ({ entries: [], warnings: [] })),
}))

vi.mock('../../core/adapters/adapter.js', () => ({
  createAdapter: vi.fn(() => ({
    platformId: 'claude-code',
    initialize: vi.fn(() => ({ success: true, errors: [] })),
    generateStepWrapper: vi.fn((input: { slug: string }) => ({
      slug: input.slug,
      platformId: 'claude-code',
      files: [],
      success: true,
    })),
    finalize: vi.fn(() => ({ files: [], errors: [] })),
  })),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { loadConfig } from '../../config/loader.js'
import { discoverMetaPrompts } from '../../core/assembly/meta-prompt-loader.js'
import { buildGraph } from '../../core/dependency/graph.js'
import { detectCycles, topologicalSort } from '../../core/dependency/dependency.js'
import { displayErrors } from '../../cli/output/error-display.js'
import buildCommand from './build.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 2,
    methodology: 'deep',
    platforms: ['claude-code'],
    ...overrides,
  }
}

function makeMetaPromptMap(names: string[]): Map<string, unknown> {
  return new Map(
    names.map(name => [
      name,
      {
        stepName: name,
        filePath: `/fake/pipeline/${name}.md`,
        frontmatter: {
          name,
          phase: 'modeling',
          order: 1,
          dependencies: [],
          outputs: [],
          knowledgeBase: [],
          conditional: null,
        },
        body: '## Purpose\nTest step.',
        sections: { Purpose: 'Test step.' },
      },
    ]),
  )
}

function makeGraph(names: string[]): { nodes: Map<string, unknown>; edges: Map<string, string[]> } {
  return {
    nodes: new Map(
      names.map(name => [
        name,
        { slug: name, phase: 'modeling', order: 1, dependencies: [], enabled: true },
      ]),
    ),
    edges: new Map(names.map(name => [name, []])),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('build command', () => {
  let exitSpy: MockInstance
  let stdoutSpy: MockInstance
  let writtenLines: string[]

  const mockFindProjectRoot = vi.mocked(findProjectRoot)
  const mockResolveOutputMode = vi.mocked(resolveOutputMode)
  const mockLoadConfig = vi.mocked(loadConfig)
  const mockDiscoverMetaPrompts = vi.mocked(discoverMetaPrompts)
  const mockBuildGraph = vi.mocked(buildGraph)
  const mockDetectCycles = vi.mocked(detectCycles)
  const mockTopologicalSort = vi.mocked(topologicalSort)

  beforeEach(() => {
    writtenLines = []
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writtenLines.push(String(chunk))
      return true
    })
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    // Defaults
    mockFindProjectRoot.mockReturnValue('/fake/project')
    mockResolveOutputMode.mockReturnValue('interactive')
    mockLoadConfig.mockReturnValue({
      config: makeConfig() as ReturnType<typeof loadConfig>['config'],
      errors: [],
      warnings: [],
    })
    mockDiscoverMetaPrompts.mockReturnValue(
      makeMetaPromptMap(['step-a', 'step-b']) as ReturnType<typeof discoverMetaPrompts>,
    )
    mockBuildGraph.mockReturnValue(
      makeGraph(['step-a', 'step-b']) as ReturnType<typeof buildGraph>,
    )
    mockDetectCycles.mockReturnValue([])
    mockTopologicalSort.mockReturnValue(['step-a', 'step-b'])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Test 1: Exits 1 when project root not found
  it('exits 1 when project root not found', async () => {
    mockFindProjectRoot.mockReturnValue(null)

    const argv = {
      'validate-only': false,
      force: false,
      format: undefined,
      auto: undefined,
      verbose: undefined,
      root: undefined,
    }
    await buildCommand.handler(argv as Parameters<typeof buildCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  // Test 2: Exits 1 when config invalid
  it('exits 1 when config has errors', async () => {
    mockLoadConfig.mockReturnValue({
      config: null,
      errors: [
        {
          code: 'CONFIG_MISSING',
          message: 'Config not found',
          exitCode: 1,
        },
      ],
      warnings: [],
    })

    const argv = {
      'validate-only': false,
      force: false,
      format: undefined,
      auto: undefined,
      verbose: undefined,
      root: undefined,
    }
    await buildCommand.handler(argv as Parameters<typeof buildCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(displayErrors).toHaveBeenCalled()
  })

  // Test 3: Exits 1 when dependency cycles detected
  it('exits 1 when dependency cycles detected', async () => {
    mockDetectCycles.mockReturnValue([
      {
        code: 'DEP_CYCLE_DETECTED',
        message: 'Cycle detected involving: step-a, step-b',
        exitCode: 1,
        context: { steps: 'step-a, step-b' },
      },
    ])

    const argv = {
      'validate-only': false,
      force: false,
      format: undefined,
      auto: undefined,
      verbose: undefined,
      root: undefined,
    }
    await buildCommand.handler(argv as Parameters<typeof buildCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(displayErrors).toHaveBeenCalled()
  })

  // Test 4: --validate-only succeeds without generating files
  it('--validate-only exits 0 and reports validation passed', async () => {
    const argv = {
      'validate-only': true,
      force: false,
      format: undefined,
      auto: undefined,
      verbose: undefined,
      root: undefined,
    }
    await buildCommand.handler(argv as Parameters<typeof buildCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(0)
    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('Validation passed')
  })

  // Test 5: Reports step count in output
  it('reports step count in human-readable output', async () => {
    const argv = {
      'validate-only': false,
      force: false,
      format: undefined,
      auto: undefined,
      verbose: undefined,
      root: undefined,
    }
    await buildCommand.handler(argv as Parameters<typeof buildCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(0)
    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('2')
  })

  // Test 6: JSON mode returns BuildResult shape
  it('JSON mode returns BuildResult shape', async () => {
    mockResolveOutputMode.mockReturnValue('json')

    const argv = {
      'validate-only': false,
      force: false,
      format: 'json',
      auto: undefined,
      verbose: undefined,
      root: undefined,
    }
    await buildCommand.handler(argv as Parameters<typeof buildCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(0)
    const allOutput = writtenLines.join('')
    const parsed = JSON.parse(allOutput)
    const data = parsed.data ?? parsed
    expect(data).toHaveProperty('stepsTotal')
    expect(data).toHaveProperty('stepsEnabled')
    expect(data).toHaveProperty('platforms')
    expect(data).toHaveProperty('generatedFiles')
    expect(data).toHaveProperty('buildTimeMs')
  })

  // Test 7: Handles empty pipeline directory (0 steps)
  it('handles empty pipeline directory gracefully', async () => {
    mockDiscoverMetaPrompts.mockReturnValue(new Map() as ReturnType<typeof discoverMetaPrompts>)
    mockBuildGraph.mockReturnValue(makeGraph([]) as ReturnType<typeof buildGraph>)
    mockTopologicalSort.mockReturnValue([])

    const argv = {
      'validate-only': false,
      force: false,
      format: undefined,
      auto: undefined,
      verbose: undefined,
      root: undefined,
    }
    await buildCommand.handler(argv as Parameters<typeof buildCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(0)
    const allOutput = writtenLines.join('')
    expect(allOutput).toContain('0')
  })

  // Test 8: --validate-only JSON mode returns { valid, stepCount, cycles }
  it('--validate-only JSON mode returns validation result shape', async () => {
    mockResolveOutputMode.mockReturnValue('json')

    const argv = {
      'validate-only': true,
      force: false,
      format: 'json',
      auto: undefined,
      verbose: undefined,
      root: undefined,
    }
    await buildCommand.handler(argv as Parameters<typeof buildCommand.handler>[0])

    expect(exitSpy).toHaveBeenCalledWith(0)
    const allOutput = writtenLines.join('')
    const parsed = JSON.parse(allOutput)
    const data = parsed.data ?? parsed
    expect(data).toHaveProperty('valid', true)
    expect(data).toHaveProperty('stepCount')
    expect(data).toHaveProperty('cycles', 0)

    // Silence unused variable warnings
    void stdoutSpy
    void mockBuildGraph
  })
})
