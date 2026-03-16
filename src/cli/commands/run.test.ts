import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'
import type { PipelineState } from '../../types/state.js'
import type { StepStateEntry } from '../../types/state.js'
import type { MetaPromptFile, MetaPromptFrontmatter } from '../../types/frontmatter.js'
import type { ScaffoldConfig } from '../../types/config.js'
import type { MethodologyPreset } from '../../types/config.js'
import type { DependencyGraph } from '../../types/dependency.js'
import type { AssemblyResult } from '../../types/assembly.js'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../state/state-manager.js', () => {
  const StateManagerMock = vi.fn()
  StateManagerMock.prototype.loadState = vi.fn()
  StateManagerMock.prototype.setInProgress = vi.fn()
  StateManagerMock.prototype.markCompleted = vi.fn()
  StateManagerMock.prototype.markSkipped = vi.fn()
  StateManagerMock.prototype.clearInProgress = vi.fn()
  return { StateManager: StateManagerMock }
})

vi.mock('../../state/lock-manager.js', () => ({
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
  checkLock: vi.fn(),
}))

vi.mock('../../state/completion.js', () => ({
  analyzeCrash: vi.fn(),
}))

vi.mock('../../core/assembly/engine.js', () => {
  const AssemblyEngineMock = vi.fn()
  AssemblyEngineMock.prototype.assemble = vi.fn()
  return { AssemblyEngine: AssemblyEngineMock }
})

vi.mock('../../core/assembly/meta-prompt-loader.js', () => ({
  discoverMetaPrompts: vi.fn(),
  loadMetaPrompt: vi.fn(),
}))

vi.mock('../../core/assembly/knowledge-loader.js', () => ({
  buildIndex: vi.fn(),
  loadEntries: vi.fn(),
}))

vi.mock('../../core/assembly/instruction-loader.js', () => ({
  loadInstructions: vi.fn(),
}))

vi.mock('../../core/assembly/depth-resolver.js', () => ({
  resolveDepth: vi.fn(),
}))

vi.mock('../../core/assembly/update-mode.js', () => ({
  detectUpdateMode: vi.fn(),
}))

vi.mock('../../core/assembly/methodology-change.js', () => ({
  detectMethodologyChange: vi.fn(),
}))

vi.mock('../../core/assembly/preset-loader.js', () => ({
  loadAllPresets: vi.fn(),
}))

vi.mock('../../config/loader.js', () => ({
  loadConfig: vi.fn(),
}))

vi.mock('../../core/dependency/graph.js', () => ({
  buildGraph: vi.fn(),
}))

vi.mock('../../core/dependency/dependency.js', () => ({
  detectCycles: vi.fn(),
  topologicalSort: vi.fn(),
}))

vi.mock('../../core/dependency/eligibility.js', () => ({
  computeEligible: vi.fn(),
}))

vi.mock('../../cli/middleware/project-root.js', () => ({
  findProjectRoot: vi.fn(),
  ROOT_OPTIONAL_COMMANDS: ['init', 'version', 'update'],
}))

vi.mock('../../cli/output/context.js', () => ({
  createOutputContext: vi.fn(),
}))

vi.mock('../../cli/output/error-display.js', () => ({
  displayErrors: vi.fn(),
}))

vi.mock('../../cli/middleware/output-mode.js', () => ({
  resolveOutputMode: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Import mocked modules
// ---------------------------------------------------------------------------

import { StateManager } from '../../state/state-manager.js'
import { acquireLock, releaseLock } from '../../state/lock-manager.js'
import { analyzeCrash } from '../../state/completion.js'
import { AssemblyEngine } from '../../core/assembly/engine.js'
import { discoverMetaPrompts } from '../../core/assembly/meta-prompt-loader.js'
import { buildIndex, loadEntries } from '../../core/assembly/knowledge-loader.js'
import { loadInstructions } from '../../core/assembly/instruction-loader.js'
import { resolveDepth } from '../../core/assembly/depth-resolver.js'
import { detectUpdateMode } from '../../core/assembly/update-mode.js'
import { detectMethodologyChange } from '../../core/assembly/methodology-change.js'
import { loadAllPresets } from '../../core/assembly/preset-loader.js'
import { loadConfig } from '../../config/loader.js'
import { buildGraph } from '../../core/dependency/graph.js'
import { detectCycles, topologicalSort } from '../../core/dependency/dependency.js'
import { computeEligible } from '../../core/dependency/eligibility.js'
import { findProjectRoot } from '../../cli/middleware/project-root.js'
import { createOutputContext } from '../../cli/output/context.js'
import { resolveOutputMode } from '../../cli/middleware/output-mode.js'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeFrontmatter(overrides: Partial<MetaPromptFrontmatter> = {}): MetaPromptFrontmatter {
  return {
    name: 'create-prd',
    description: 'Create the product requirements document',
    phase: 'modeling',
    order: 1,
    dependencies: [],
    outputs: ['docs/prd.md'],
    conditional: null,
    knowledgeBase: [],
    reads: [],
    ...overrides,
  }
}

function makeMetaPrompt(overrides: Partial<MetaPromptFile> = {}): MetaPromptFile {
  return {
    stepName: 'create-prd',
    filePath: '/project/pipeline/create-prd.md',
    frontmatter: makeFrontmatter(),
    body: 'Create a PRD.',
    sections: {},
    ...overrides,
  }
}

function makeConfig(overrides: Partial<ScaffoldConfig> = {}): ScaffoldConfig {
  return {
    version: 2,
    methodology: 'deep',
    platforms: ['claude-code'],
    ...overrides,
  }
}

function makeState(
  steps: Record<string, StepStateEntry> = {},
  inProgress: PipelineState['in_progress'] = null,
): PipelineState {
  return {
    'schema-version': 1,
    'scaffold-version': '2.0.0',
    init_methodology: 'deep',
    config_methodology: 'deep',
    'init-mode': 'greenfield',
    created: '2024-01-01T00:00:00.000Z',
    in_progress: inProgress,
    steps: {
      'create-prd': { status: 'pending', source: 'pipeline', produces: ['docs/prd.md'] },
      ...steps,
    },
    next_eligible: [],
    'extra-steps': [],
  }
}

function makePreset(overrides: Partial<MethodologyPreset> = {}): MethodologyPreset {
  return {
    name: 'deep',
    description: 'Deep methodology',
    default_depth: 3,
    steps: {
      'create-prd': { enabled: true },
    },
    ...overrides,
  }
}

function makeGraph(): DependencyGraph {
  return {
    nodes: new Map([
      ['create-prd', { slug: 'create-prd', phase: 'modeling', order: 1, dependencies: [], enabled: true }],
    ]),
    edges: new Map([['create-prd', []]]),
  }
}

function makeOutputContext() {
  return {
    success: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    result: vi.fn(),
    prompt: vi.fn(),
    confirm: vi.fn(),
    startSpinner: vi.fn(),
    stopSpinner: vi.fn(),
    startProgress: vi.fn(),
    updateProgress: vi.fn(),
    stopProgress: vi.fn(),
  }
}

function makeSuccessAssemblyResult(): AssemblyResult {
  return {
    success: true,
    prompt: {
      text: 'assembled prompt text',
      sections: [],
      metadata: {
        stepName: 'create-prd',
        depth: 3,
        depthProvenance: 'preset-default',
        knowledgeBaseEntries: [],
        instructionLayers: [],
        artifactCount: 0,
        decisionCount: 0,
        assemblyDurationMs: 10,
        assembledAt: '2024-01-01T00:00:00.000Z',
        updateMode: false,
        sectionsIncluded: [],
      },
    },
    errors: [],
    warnings: [],
  }
}

// ---------------------------------------------------------------------------
// Setup shared mocks before each test
// ---------------------------------------------------------------------------

const PROJECT_ROOT = '/test/project'

let exitSpy: MockInstance
let stdoutSpy: MockInstance
let mockOutput: ReturnType<typeof makeOutputContext>

beforeEach(() => {
  vi.clearAllMocks()

  exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
    throw new Error('process.exit called')
  }) as never)

  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

  mockOutput = makeOutputContext()

  // Default happy-path mock returns
  vi.mocked(findProjectRoot).mockReturnValue(PROJECT_ROOT)
  vi.mocked(resolveOutputMode).mockReturnValue('auto')
  vi.mocked(createOutputContext).mockReturnValue(mockOutput as ReturnType<typeof makeOutputContext>)

  const config = makeConfig()
  vi.mocked(loadConfig).mockReturnValue({ config, errors: [], warnings: [] })

  const metaPrompt = makeMetaPrompt()
  vi.mocked(discoverMetaPrompts).mockReturnValue(new Map([['create-prd', metaPrompt]]))

  const preset = makePreset()
  vi.mocked(loadAllPresets).mockReturnValue({
    deep: preset,
    mvp: makePreset({ name: 'mvp', default_depth: 1 }),
    custom: null,
    errors: [],
    warnings: [],
  })

  vi.mocked(acquireLock).mockReturnValue({ acquired: true })

  const state = makeState()
  vi.mocked(StateManager.prototype.loadState).mockReturnValue(state)
  vi.mocked(StateManager.prototype.setInProgress).mockImplementation(() => undefined)
  vi.mocked(StateManager.prototype.markCompleted).mockImplementation(() => undefined)
  vi.mocked(StateManager.prototype.markSkipped).mockImplementation(() => undefined)
  vi.mocked(StateManager.prototype.clearInProgress).mockImplementation(() => undefined)

  vi.mocked(analyzeCrash).mockReturnValue({
    action: 'recommend_rerun',
    presentArtifacts: [],
    missingArtifacts: [],
  })

  const graph = makeGraph()
  vi.mocked(buildGraph).mockReturnValue(graph)
  vi.mocked(detectCycles).mockReturnValue([])
  vi.mocked(topologicalSort).mockReturnValue(['create-prd'])
  vi.mocked(computeEligible).mockReturnValue([])

  vi.mocked(resolveDepth).mockReturnValue({ depth: 3, provenance: 'preset-default' })
  vi.mocked(detectUpdateMode).mockReturnValue({
    isUpdateMode: false,
    currentDepth: 3,
    warnings: [],
  })
  vi.mocked(detectMethodologyChange).mockReturnValue({
    changed: false,
    stateMeta: 'deep',
    configMeta: 'deep',
    warnings: [],
  })

  vi.mocked(loadInstructions).mockReturnValue({
    instructions: { global: null, perStep: null, inline: null },
    warnings: [],
  })
  vi.mocked(buildIndex).mockReturnValue(new Map())
  vi.mocked(loadEntries).mockReturnValue({ entries: [], warnings: [] })

  const assemblyResult = makeSuccessAssemblyResult()
  vi.mocked(AssemblyEngine.prototype.assemble).mockReturnValue(assemblyResult)

  vi.mocked(releaseLock).mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Import the handler under test (lazy to allow mocks to be in place)
// ---------------------------------------------------------------------------

async function importHandler() {
  // Re-import each time to pick up fresh mocks
  const mod = await import('./run.js?t=' + Date.now())
  return mod.default
}

async function invokeHandler(argv: Record<string, unknown>) {
  const cmd = await importHandler()
  // cmd.handler is the actual yargs handler; call it directly
  if (typeof cmd.handler === 'function') {
    await cmd.handler(argv as Parameters<typeof cmd.handler>[0])
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('run command handler', () => {
  describe('Step 1: resolve context', () => {
    it('exits 1 when project root is not found', async () => {
      vi.mocked(findProjectRoot).mockReturnValue(null)

      await expect(invokeHandler({ step: 'create-prd', _: ['run'], root: undefined }))
        .rejects.toThrow('process.exit called')

      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('exits 1 when config cannot be loaded', async () => {
      vi.mocked(loadConfig).mockReturnValue({
        config: null,
        errors: [{ code: 'CONFIG_MISSING', message: 'Config missing', exitCode: 1 }],
        warnings: [],
      })

      await expect(invokeHandler({ step: 'create-prd', _: ['run'] }))
        .rejects.toThrow('process.exit called')

      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })

  describe('Step 2: discover pipeline', () => {
    it('exits 1 when step is not found in pipeline', async () => {
      vi.mocked(discoverMetaPrompts).mockReturnValue(new Map())

      await expect(invokeHandler({ step: 'unknown-step', _: ['run'] }))
        .rejects.toThrow('process.exit called')

      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('includes fuzzy match suggestion in error when step not found', async () => {
      vi.mocked(discoverMetaPrompts).mockReturnValue(new Map([
        ['create-prd', makeMetaPrompt()],
      ]))

      await expect(invokeHandler({ step: 'create-pr', _: ['run'] }))
        .rejects.toThrow('process.exit called')

      // Should have called output.error or displayErrors
      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })

  describe('Step 3: lock acquisition', () => {
    it('exits 3 when lock is not acquired and --force is not set', async () => {
      vi.mocked(acquireLock).mockReturnValue({
        acquired: false,
        error: { code: 'LOCK_HELD', message: 'Lock held', exitCode: 3 },
      })

      await expect(invokeHandler({ step: 'create-prd', _: ['run'], force: false }))
        .rejects.toThrow('process.exit called')

      expect(exitSpy).toHaveBeenCalledWith(3)
    })

    it('proceeds when lock is not acquired but --force is set', async () => {
      vi.mocked(acquireLock).mockReturnValue({
        acquired: false,
        error: { code: 'LOCK_HELD', message: 'Lock held', exitCode: 3 },
      })

      // Should NOT exit 3, should complete (exits 0 in auto mode)
      await expect(invokeHandler({ step: 'create-prd', _: ['run'], force: true, auto: true }))
        .rejects.toThrow('process.exit called')

      // In auto mode, exits 0 after prompt output
      expect(exitSpy).toHaveBeenCalledWith(0)
    })
  })

  describe('Step 4: crash recovery', () => {
    it('clears in_progress when state has crashed in_progress', async () => {
      const stateWithInProgress = makeState(
        { 'create-prd': { status: 'in_progress', source: 'pipeline', produces: [] } },
        { step: 'create-prd', started: '2024-01-01T00:00:00.000Z', partial_artifacts: [], actor: 'scaffold-run' },
      )
      vi.mocked(StateManager.prototype.loadState).mockReturnValue(stateWithInProgress)
      vi.mocked(analyzeCrash).mockReturnValue({
        action: 'auto_complete',
        presentArtifacts: ['docs/prd.md'],
        missingArtifacts: [],
      })

      // Should clear in_progress and proceed; in auto mode exits 0
      await expect(invokeHandler({ step: 'create-prd', _: ['run'], auto: true }))
        .rejects.toThrow('process.exit called')

      expect(StateManager.prototype.clearInProgress).toHaveBeenCalled()
    })

    it('warns and exits 4 in auto mode when crash action is ask_user', async () => {
      const stateWithInProgress = makeState(
        { 'create-prd': { status: 'in_progress', source: 'pipeline', produces: [] } },
        { step: 'create-prd', started: '2024-01-01T00:00:00.000Z', partial_artifacts: [], actor: 'scaffold-run' },
      )
      vi.mocked(StateManager.prototype.loadState).mockReturnValue(stateWithInProgress)
      vi.mocked(analyzeCrash).mockReturnValue({
        action: 'ask_user',
        presentArtifacts: ['docs/prd.md'],
        missingArtifacts: ['docs/other.md'],
      })

      vi.mocked(resolveOutputMode).mockReturnValue('auto')

      await expect(invokeHandler({ step: 'create-prd', _: ['run'], auto: true }))
        .rejects.toThrow('process.exit called')

      expect(exitSpy).toHaveBeenCalledWith(4)
    })
  })

  describe('Step 5: dependency check', () => {
    it('exits 2 when step dependencies are not met', async () => {
      const metaPrompt = makeMetaPrompt({
        frontmatter: makeFrontmatter({ name: 'create-arch', dependencies: ['create-prd'] }),
        stepName: 'create-arch',
      })
      vi.mocked(discoverMetaPrompts).mockReturnValue(new Map([
        ['create-prd', makeMetaPrompt()],
        ['create-arch', metaPrompt],
      ]))

      const state = makeState({
        'create-prd': { status: 'pending', source: 'pipeline', produces: [] },
        'create-arch': { status: 'pending', source: 'pipeline', produces: [] },
      })
      vi.mocked(StateManager.prototype.loadState).mockReturnValue(state)

      const graph: DependencyGraph = {
        nodes: new Map([
          ['create-prd', { slug: 'create-prd', phase: 'modeling', order: 1, dependencies: [], enabled: true }],
          ['create-arch', {
            slug: 'create-arch', phase: 'architecture', order: 2, dependencies: ['create-prd'], enabled: true,
          }],
        ]),
        edges: new Map([
          ['create-prd', ['create-arch']],
          ['create-arch', []],
        ]),
      }
      vi.mocked(buildGraph).mockReturnValue(graph)

      await expect(invokeHandler({ step: 'create-arch', _: ['run'] }))
        .rejects.toThrow('process.exit called')

      expect(exitSpy).toHaveBeenCalledWith(2)
    })

    it('exits 1 when dependency cycles are detected', async () => {
      vi.mocked(detectCycles).mockReturnValue([
        { code: 'DEP_CYCLE_DETECTED', message: 'Cycle detected', exitCode: 1 },
      ])

      await expect(invokeHandler({ step: 'create-prd', _: ['run'] }))
        .rejects.toThrow('process.exit called')

      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })

  describe('Step 9: assembly', () => {
    it('outputs assembled prompt text to stdout on success (auto mode)', async () => {
      vi.mocked(resolveOutputMode).mockReturnValue('auto')

      await expect(invokeHandler({ step: 'create-prd', _: ['run'], auto: true }))
        .rejects.toThrow('process.exit called')

      // Prompt text should be written to stdout
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('assembled prompt text'))
      expect(exitSpy).toHaveBeenCalledWith(0)
    })

    it('exits 5 when assembly engine fails', async () => {
      vi.mocked(AssemblyEngine.prototype.assemble).mockReturnValue({
        success: false,
        errors: [{ code: 'ASM_UNEXPECTED_ERROR', message: 'Assembly failed', exitCode: 5 }],
        warnings: [],
      })

      await expect(invokeHandler({ step: 'create-prd', _: ['run'] }))
        .rejects.toThrow('process.exit called')

      expect(exitSpy).toHaveBeenCalledWith(5)
    })
  })

  describe('Step 10: completion (auto mode)', () => {
    it('auto mode exits 0 immediately after prompt output', async () => {
      vi.mocked(resolveOutputMode).mockReturnValue('auto')

      await expect(invokeHandler({ step: 'create-prd', _: ['run'], auto: true }))
        .rejects.toThrow('process.exit called')

      expect(exitSpy).toHaveBeenCalledWith(0)
    })
  })

  describe('Step 11: mark completed (interactive)', () => {
    it('marks step completed when user confirms in interactive mode', async () => {
      vi.mocked(resolveOutputMode).mockReturnValue('interactive')
      mockOutput.confirm = vi.fn().mockResolvedValue(true)

      await expect(invokeHandler({ step: 'create-prd', _: ['run'] }))
        .rejects.toThrow('process.exit called')

      expect(StateManager.prototype.markCompleted).toHaveBeenCalledWith(
        'create-prd',
        expect.any(Array),
        'scaffold-run',
        expect.any(Number),
      )
      expect(exitSpy).toHaveBeenCalledWith(0)
    })

    it('exits 4 when user declines completion in interactive mode', async () => {
      vi.mocked(resolveOutputMode).mockReturnValue('interactive')
      // User says no to "complete?", no to "skip?"
      mockOutput.confirm = vi.fn()
        .mockResolvedValueOnce(false)  // "Step complete?" -> No
        .mockResolvedValueOnce(false)  // "Mark as skipped?" -> No

      await expect(invokeHandler({ step: 'create-prd', _: ['run'] }))
        .rejects.toThrow('process.exit called')

      expect(exitSpy).toHaveBeenCalledWith(4)
    })
  })

  describe('Depth override', () => {
    it('passes --depth CLI flag to resolveDepth', async () => {
      vi.mocked(resolveDepth).mockReturnValue({ depth: 3, provenance: 'cli-flag' })

      await expect(invokeHandler({ step: 'create-prd', _: ['run'], depth: 3, auto: true }))
        .rejects.toThrow('process.exit called')

      expect(resolveDepth).toHaveBeenCalledWith(
        'create-prd',
        expect.any(Object),   // config
        expect.any(Object),   // preset
        3,                    // cliDepth from --depth 3
      )
    })
  })

  describe('JSON output format', () => {
    it('outputs structured JSON result in json mode', async () => {
      vi.mocked(resolveOutputMode).mockReturnValue('json')
      vi.mocked(computeEligible).mockReturnValue(['next-step'])

      // In JSON mode, like auto mode, exits 0 after prompt output
      await expect(invokeHandler({ step: 'create-prd', _: ['run'], format: 'json' }))
        .rejects.toThrow('process.exit called')

      // In json mode output.result is called with structured data
      expect(mockOutput.result).toHaveBeenCalledWith(
        expect.objectContaining({
          step: 'create-prd',
          status: 'completed',
          depth: expect.any(Number),
          nextEligible: expect.any(Array),
        }),
      )
    })
  })

  describe('--instructions flag', () => {
    it('passes inline instructions to loadInstructions', async () => {
      await expect(invokeHandler({ step: 'create-prd', _: ['run'], instructions: 'Be thorough', auto: true }))
        .rejects.toThrow('process.exit called')

      expect(loadInstructions).toHaveBeenCalledWith(
        expect.any(String),
        'create-prd',
        'Be thorough',
      )
    })
  })

  describe('update mode', () => {
    it('proceeds in update mode without prompt when --force is set', async () => {
      vi.mocked(detectUpdateMode).mockReturnValue({
        isUpdateMode: true,
        currentDepth: 3,
        existingArtifact: {
          filePath: 'docs/prd.md',
          content: 'old content',
          previousDepth: 3,
          completionTimestamp: '2024-01-01T00:00:00.000Z',
        },
        warnings: [],
      })

      await expect(invokeHandler({ step: 'create-prd', _: ['run'], force: true, auto: true }))
        .rejects.toThrow('process.exit called')

      // Should exit 0 (success, not 4 cancellation)
      expect(exitSpy).toHaveBeenCalledWith(0)
    })
  })

  describe('lock release', () => {
    it('releases lock after successful run', async () => {
      vi.mocked(resolveOutputMode).mockReturnValue('interactive')
      mockOutput.confirm = vi.fn().mockResolvedValue(true)

      await expect(invokeHandler({ step: 'create-prd', _: ['run'] }))
        .rejects.toThrow('process.exit called')

      expect(releaseLock).toHaveBeenCalledWith(PROJECT_ROOT)
    })
  })
})
