import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'
import fs from 'node:fs'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockOutput } = vi.hoisted(() => ({
  mockOutput: {
    success: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    result: vi.fn(),
    prompt: vi.fn().mockResolvedValue(''),
    confirm: vi.fn().mockResolvedValue(false),
    select: vi.fn().mockResolvedValue(''),
    multiSelect: vi.fn().mockResolvedValue([]),
    multiInput: vi.fn().mockResolvedValue([]),
    startSpinner: vi.fn(),
    stopSpinner: vi.fn(),
    startProgress: vi.fn(),
    updateProgress: vi.fn(),
    stopProgress: vi.fn(),
  },
}))

vi.mock('../middleware/project-root.js', () => ({
  findProjectRoot: vi.fn(),
}))

vi.mock('../middleware/output-mode.js', () => ({
  resolveOutputMode: vi.fn(() => 'interactive'),
}))

vi.mock('../output/context.js', () => ({
  createOutputContext: vi.fn(() => mockOutput),
}))

vi.mock('../../config/loader.js', () => ({
  loadConfig: vi.fn(),
}))

vi.mock('../../core/assembly/meta-prompt-loader.js', () => ({
  discoverAllMetaPrompts: vi.fn(),
}))

vi.mock('../../utils/fs.js', () => ({
  getPackageRoot: vi.fn(() => '/fake'),
  getPackagePipelineDir: vi.fn(() => '/fake/content/pipeline'),
  getPackageMethodologyDir: vi.fn(() => '/fake/content/methodology'),
  getPackageKnowledgeDir: vi.fn(() => '/fake/content/knowledge'),
  getPackageToolsDir: vi.fn(() => '/fake/content/tools'),
  atomicWriteFile: vi.fn(),
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

vi.mock('../../project/gitignore.js', () => ({
  ensureScaffoldGitignore: vi.fn(() => ({ created: false, updated: false, warnings: [] })),
  findLegacyGeneratedOutputs: vi.fn(() => []),
}))

vi.mock('../../core/adapters/adapter.js', () => ({
  createAdapter: vi.fn((platformId: string) => ({
    platformId,
    initialize: vi.fn(() => ({ success: true, errors: [] })),
    generateStepWrapper: vi.fn((input: { slug: string }) => ({
      slug: input.slug,
      platformId,
      files: platformId === 'claude-code'
        ? [{
          relativePath: `.scaffold/generated/claude-code/commands/${input.slug}.md`,
          content: `command:${input.slug}`,
          writeMode: 'create',
        }]
        : platformId === 'gemini'
          ? [{
            relativePath: `.gemini/commands/scaffold/${input.slug}.toml`,
            content: `gemini:${input.slug}`,
            writeMode: 'create',
          }]
          : [],
      success: true,
    })),
    finalize: vi.fn(() => ({
      files: platformId === 'gemini'
        ? [
          {
            relativePath: '.agents/skills/scaffold-runner/SKILL.md',
            content: 'runner',
            writeMode: 'create',
          },
          {
            relativePath: '.agents/skills/scaffold-pipeline/SKILL.md',
            content: 'pipeline',
            writeMode: 'create',
          },
          {
            relativePath: 'GEMINI.md',
            content: 'gemini',
            writeMode: 'create',
          },
        ]
        : platformId === 'universal'
          ? [{
            relativePath: '.scaffold/generated/universal/prompts/README.md',
            content: 'universal',
            writeMode: 'create',
          }]
          : [],
      errors: [],
    })),
  })),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { findProjectRoot } from '../middleware/project-root.js'
import { resolveOutputMode } from '../middleware/output-mode.js'
import { createOutputContext } from '../output/context.js'
import { loadConfig } from '../../config/loader.js'
import { discoverAllMetaPrompts } from '../../core/assembly/meta-prompt-loader.js'
import { atomicWriteFile } from '../../utils/fs.js'
import { buildGraph } from '../../core/dependency/graph.js'
import { detectCycles, topologicalSort } from '../../core/dependency/dependency.js'
import { displayErrors } from '../../cli/output/error-display.js'
import { ensureScaffoldGitignore, findLegacyGeneratedOutputs } from '../../project/gitignore.js'
import { createAdapter } from '../../core/adapters/adapter.js'
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
        filePath: `/fake/content/pipeline/${name}.md`,
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

  const mockFindProjectRoot = vi.mocked(findProjectRoot)
  const mockResolveOutputMode = vi.mocked(resolveOutputMode)
  const mockCreateOutputContext = vi.mocked(createOutputContext)
  const mockLoadConfig = vi.mocked(loadConfig)
  const mockDiscoverMetaPrompts = vi.mocked(discoverAllMetaPrompts)
  const mockAtomicWriteFile = vi.mocked(atomicWriteFile)
  const mockBuildGraph = vi.mocked(buildGraph)
  const mockDetectCycles = vi.mocked(detectCycles)
  const mockTopologicalSort = vi.mocked(topologicalSort)
  const mockEnsureScaffoldGitignore = vi.mocked(ensureScaffoldGitignore)
  const mockFindLegacyGeneratedOutputs = vi.mocked(findLegacyGeneratedOutputs)
  const mockCreateAdapter = vi.mocked(createAdapter)

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    vi.spyOn(fs, 'mkdirSync').mockImplementation((() => undefined) as typeof fs.mkdirSync)
    for (const fn of Object.values(mockOutput)) {
      if (typeof fn === 'function' && 'mockReset' in fn) {
        fn.mockReset()
      }
    }
    mockOutput.prompt.mockResolvedValue('')
    mockOutput.confirm.mockResolvedValue(false)

    // Defaults
    mockFindProjectRoot.mockReturnValue('/fake/project')
    mockResolveOutputMode.mockReturnValue('interactive')
    mockCreateOutputContext.mockReturnValue(mockOutput)
    mockLoadConfig.mockReturnValue({
      config: makeConfig() as ReturnType<typeof loadConfig>['config'],
      errors: [],
      warnings: [],
    })
    mockDiscoverMetaPrompts.mockReturnValue(
      makeMetaPromptMap(['step-a', 'step-b']) as ReturnType<typeof discoverAllMetaPrompts>,
    )
    mockBuildGraph.mockReturnValue(
      makeGraph(['step-a', 'step-b']) as ReturnType<typeof buildGraph>,
    )
    mockDetectCycles.mockReturnValue([])
    mockTopologicalSort.mockReturnValue(['step-a', 'step-b'])
    mockEnsureScaffoldGitignore.mockReturnValue({ created: false, updated: false, warnings: [] })
    mockFindLegacyGeneratedOutputs.mockReturnValue([])
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
    expect(mockOutput.success).toHaveBeenCalledWith(expect.stringContaining('Validation passed'))
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
    expect(mockOutput.success).toHaveBeenCalledWith(expect.stringContaining('2'))
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
    expect(mockOutput.result).toHaveBeenCalledTimes(1)
    const data = mockOutput.result.mock.calls[0]?.[0]
    expect(data).toHaveProperty('stepsTotal')
    expect(data).toHaveProperty('stepsEnabled')
    expect(data).toHaveProperty('platforms')
    expect(data).toHaveProperty('generatedFiles')
    expect(data).toHaveProperty('buildTimeMs')
  })

  // Test 7: Handles empty pipeline directory (0 steps)
  it('handles empty pipeline directory gracefully', async () => {
    mockDiscoverMetaPrompts.mockReturnValue(new Map() as ReturnType<typeof discoverAllMetaPrompts>)
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
    expect(mockOutput.success).toHaveBeenCalledWith(expect.stringContaining('0'))
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
    expect(mockOutput.result).toHaveBeenCalledTimes(1)
    const data = mockOutput.result.mock.calls[0]?.[0]
    expect(data).toHaveProperty('valid', true)
    expect(data).toHaveProperty('stepCount')
    expect(data).toHaveProperty('cycles', 0)

    void mockBuildGraph
  })

  it('ensures scaffold managed .gitignore before writing outputs', async () => {
    const argv = defaultBuildArgv()

    await buildCommand.handler(argv)

    expect(mockEnsureScaffoldGitignore).toHaveBeenCalledWith('/fake/project')
  })

  it('warns when legacy root outputs are present', async () => {
    mockFindLegacyGeneratedOutputs.mockReturnValue(['commands/', 'AGENTS.md'])

    await buildCommand.handler(defaultBuildArgv())

    expect(mockOutput.warn).toHaveBeenCalledWith(expect.objectContaining({
      code: 'LEGACY_GENERATED_OUTPUTS_PRESENT',
    }))
  })

  it('always builds universal output in addition to configured platforms', async () => {
    await buildCommand.handler(defaultBuildArgv())

    expect(mockCreateAdapter).toHaveBeenCalledWith('claude-code')
    expect(mockCreateAdapter).toHaveBeenCalledWith('universal')
  })

  it('writes aggregate finalize files from adapters', async () => {
    await buildCommand.handler(defaultBuildArgv())

    expect(mockAtomicWriteFile).toHaveBeenCalledWith(
      '/fake/project/.scaffold/generated/universal/prompts/README.md',
      'universal',
    )
  })

  it('writes Gemini output when gemini is configured', async () => {
    mockLoadConfig.mockReturnValue({
      config: makeConfig({ platforms: ['claude-code', 'gemini'] }) as ReturnType<typeof loadConfig>['config'],
      errors: [],
      warnings: [],
    })

    await buildCommand.handler(defaultBuildArgv())

    expect(mockCreateAdapter).toHaveBeenCalledWith('gemini')
    expect(mockAtomicWriteFile).toHaveBeenCalledWith(
      '/fake/project/.gemini/commands/scaffold/step-a.toml',
      expect.any(String),
    )
  })

  it('does not write legacy root output paths', async () => {
    await buildCommand.handler(defaultBuildArgv())

    const writtenPaths = mockAtomicWriteFile.mock.calls.map(call => call[0])
    expect(writtenPaths).not.toContain('/fake/project/commands/step-a.md')
    expect(writtenPaths).not.toContain('/fake/project/AGENTS.md')
  })
})

function defaultBuildArgv() {
  return {
    'validate-only': false,
    force: false,
    format: undefined,
    auto: undefined,
    verbose: undefined,
    root: undefined,
  } as Parameters<typeof buildCommand.handler>[0]
}
