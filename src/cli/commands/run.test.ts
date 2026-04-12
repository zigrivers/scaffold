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
  discoverAllMetaPrompts: vi.fn(),
  loadMetaPrompt: vi.fn(),
}))

vi.mock('../../utils/fs.js', () => ({
  getPackagePipelineDir: vi.fn(() => '/test/content/pipeline'),
  getPackageMethodologyDir: vi.fn(() => '/test/content/methodology'),
  getPackageKnowledgeDir: vi.fn(() => '/test/content/knowledge'),
  getPackageToolsDir: vi.fn(() => '/test/content/tools'),
}))

vi.mock('../../core/assembly/knowledge-loader.js', () => ({
  buildIndexWithOverrides: vi.fn(),
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

vi.mock('../../core/assembly/overlay-loader.js', () => ({
  loadOverlay: vi.fn(),
}))

vi.mock('../../core/assembly/overlay-resolver.js', () => ({
  applyOverlay: vi.fn(),
}))

vi.mock('../../core/assembly/overlay-state-resolver.js', () => ({
  resolveOverlayState: vi.fn(({ presetSteps }: { presetSteps: Record<string, unknown> }) => ({
    steps: presetSteps,
    knowledge: {},
    reads: {},
    dependencies: {},
  })),
}))

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(actual.existsSync),
      readFileSync: vi.fn(actual.readFileSync),
    },
  }
})

vi.mock('../../config/loader.js', () => ({
  loadConfig: vi.fn(),
}))

vi.mock('../../core/dependency/graph.js', () => ({
  buildGraph: vi.fn(),
}))

vi.mock('../../core/dependency/dependency.js', () => ({
  detectCycles: vi.fn(),
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
import { discoverMetaPrompts, discoverAllMetaPrompts } from '../../core/assembly/meta-prompt-loader.js'
import { buildIndexWithOverrides, loadEntries } from '../../core/assembly/knowledge-loader.js'
import { loadInstructions } from '../../core/assembly/instruction-loader.js'
import { resolveDepth } from '../../core/assembly/depth-resolver.js'
import { detectUpdateMode } from '../../core/assembly/update-mode.js'
import { detectMethodologyChange } from '../../core/assembly/methodology-change.js'
import { loadAllPresets } from '../../core/assembly/preset-loader.js'
import { loadOverlay } from '../../core/assembly/overlay-loader.js'
import { resolveOverlayState } from '../../core/assembly/overlay-state-resolver.js'
import { loadConfig } from '../../config/loader.js'
import { buildGraph } from '../../core/dependency/graph.js'
import { detectCycles } from '../../core/dependency/dependency.js'
import { computeEligible } from '../../core/dependency/eligibility.js'
import { findProjectRoot } from '../../cli/middleware/project-root.js'
import { createOutputContext } from '../../cli/output/context.js'
import { resolveOutputMode } from '../../cli/middleware/output-mode.js'
import fs from 'node:fs'

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
    stateless: false,
    category: 'pipeline' as const,
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
    supportsInteractivePrompts: vi.fn().mockReturnValue(false),
    prompt: vi.fn(),
    confirm: vi.fn(),
    select: vi.fn(),
    multiSelect: vi.fn(),
    multiInput: vi.fn(),
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
    // no-op — run.ts no longer calls process.exit(); it sets process.exitCode
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
  const defaultMetaPromptMap = new Map([['create-prd', metaPrompt]])
  vi.mocked(discoverMetaPrompts).mockReturnValue(defaultMetaPromptMap)
  vi.mocked(discoverAllMetaPrompts).mockReturnValue(defaultMetaPromptMap)

  const preset = makePreset()
  vi.mocked(loadAllPresets).mockReturnValue({
    deep: preset,
    mvp: makePreset({ name: 'mvp', default_depth: 1 }),
    custom: null,
    errors: [],
    warnings: [],
  })

  // loadOverlay: default no overlay (only called when config has projectType)
  vi.mocked(loadOverlay).mockReturnValue({ overlay: null, errors: [], warnings: [] })

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
  vi.mocked(buildIndexWithOverrides).mockReturnValue(new Map())
  vi.mocked(loadEntries).mockReturnValue({ entries: [], warnings: [] })

  const assemblyResult = makeSuccessAssemblyResult()
  vi.mocked(AssemblyEngine.prototype.assemble).mockReturnValue(assemblyResult)

  vi.mocked(releaseLock).mockImplementation(() => undefined)
})

afterEach(() => {
  process.exitCode = undefined
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

      await invokeHandler({ step: 'create-prd', _: ['run'], root: undefined })

      expect(process.exitCode).toBe(1)
    })

    it('exits 1 when config cannot be loaded', async () => {
      vi.mocked(loadConfig).mockReturnValue({
        config: null,
        errors: [{ code: 'CONFIG_MISSING', message: 'Config missing', exitCode: 1 }],
        warnings: [],
      })

      await invokeHandler({ step: 'create-prd', _: ['run'] })

      expect(process.exitCode).toBe(1)
    })
  })

  describe('Step 2: discover pipeline', () => {
    it('exits 1 when step is not found in pipeline', async () => {
      vi.mocked(discoverMetaPrompts).mockReturnValue(new Map())
      vi.mocked(discoverAllMetaPrompts).mockReturnValue(new Map())

      await invokeHandler({ step: 'unknown-step', _: ['run'] })

      expect(process.exitCode).toBe(1)
    })

    it('includes fuzzy match suggestion in error when step not found', async () => {
      const map = new Map([['create-prd', makeMetaPrompt()]])
      vi.mocked(discoverMetaPrompts).mockReturnValue(map)
      vi.mocked(discoverAllMetaPrompts).mockReturnValue(map)

      await invokeHandler({ step: 'create-pr', _: ['run'] })

      // Should have called output.error or displayErrors
      expect(process.exitCode).toBe(1)
    })
  })

  describe('Step 3: lock acquisition', () => {
    it('exits 3 when lock is not acquired and --force is not set', async () => {
      vi.mocked(acquireLock).mockReturnValue({
        acquired: false,
        error: { code: 'LOCK_HELD', message: 'Lock held', exitCode: 3 },
      })

      await invokeHandler({ step: 'create-prd', _: ['run'], force: false })

      expect(process.exitCode).toBe(3)
    })

    it('proceeds when lock is not acquired but --force is set', async () => {
      vi.mocked(acquireLock).mockReturnValue({
        acquired: false,
        error: { code: 'LOCK_HELD', message: 'Lock held', exitCode: 3 },
      })

      // Should NOT exit 3, should complete (returns normally in auto mode)
      await invokeHandler({ step: 'create-prd', _: ['run'], force: true, auto: true })

      // In auto mode, returns normally (exitCode undefined = 0)
      expect(process.exitCode).toBeUndefined()
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

      // Should clear in_progress and proceed; in auto mode returns normally
      await invokeHandler({ step: 'create-prd', _: ['run'], auto: true })

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

      await invokeHandler({ step: 'create-prd', _: ['run'], auto: true })

      expect(process.exitCode).toBe(4)
    })
  })

  describe('Step 5: dependency check', () => {
    it('exits 2 when step dependencies are not met', async () => {
      const metaPrompt = makeMetaPrompt({
        frontmatter: makeFrontmatter({ name: 'create-arch', dependencies: ['create-prd'] }),
        stepName: 'create-arch',
      })
      const depMap = new Map([
        ['create-prd', makeMetaPrompt()],
        ['create-arch', metaPrompt],
      ])
      vi.mocked(discoverMetaPrompts).mockReturnValue(depMap)
      vi.mocked(discoverAllMetaPrompts).mockReturnValue(depMap)

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

      await invokeHandler({ step: 'create-arch', _: ['run'] })

      expect(process.exitCode).toBe(2)
    })

    it('exits 1 when dependency cycles are detected', async () => {
      vi.mocked(detectCycles).mockReturnValue([
        { code: 'DEP_CYCLE_DETECTED', message: 'Cycle detected', exitCode: 1 },
      ])

      await invokeHandler({ step: 'create-prd', _: ['run'] })

      expect(process.exitCode).toBe(1)
    })
  })

  describe('Step 9: assembly', () => {
    it('outputs assembled prompt text to stdout on success (auto mode)', async () => {
      vi.mocked(resolveOutputMode).mockReturnValue('auto')

      await invokeHandler({ step: 'create-prd', _: ['run'], auto: true })

      // Prompt text should be written to stdout
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('assembled prompt text'))
      expect(process.exitCode).toBeUndefined()
    })

    it('exits 5 when assembly engine fails', async () => {
      vi.mocked(AssemblyEngine.prototype.assemble).mockReturnValue({
        success: false,
        errors: [{ code: 'ASM_UNEXPECTED_ERROR', message: 'Assembly failed', exitCode: 5 }],
        warnings: [],
      })

      await invokeHandler({ step: 'create-prd', _: ['run'] })

      expect(process.exitCode).toBe(5)
    })
  })

  describe('Step 10: completion (auto mode)', () => {
    it('auto mode returns normally after prompt output', async () => {
      vi.mocked(resolveOutputMode).mockReturnValue('auto')

      await invokeHandler({ step: 'create-prd', _: ['run'], auto: true })

      expect(process.exitCode).toBeUndefined()
    })
  })

  describe('Step 11: mark completed (interactive)', () => {
    it('marks step completed when user confirms in interactive mode', async () => {
      vi.mocked(resolveOutputMode).mockReturnValue('interactive')
      mockOutput.confirm = vi.fn().mockResolvedValue(true)

      await invokeHandler({ step: 'create-prd', _: ['run'] })

      expect(StateManager.prototype.markCompleted).toHaveBeenCalledWith(
        'create-prd',
        expect.any(Array),
        'scaffold-run',
        expect.any(Number),
      )
      expect(process.exitCode).toBeUndefined()
    })

    it('exits 4 when user declines completion in interactive mode', async () => {
      vi.mocked(resolveOutputMode).mockReturnValue('interactive')
      // User says no to "complete?", no to "skip?"
      mockOutput.confirm = vi.fn()
        .mockResolvedValueOnce(false)  // "Step complete?" -> No
        .mockResolvedValueOnce(false)  // "Mark as skipped?" -> No

      await invokeHandler({ step: 'create-prd', _: ['run'] })

      expect(process.exitCode).toBe(4)
    })
  })

  describe('Depth override', () => {
    it('passes --depth CLI flag to resolveDepth', async () => {
      vi.mocked(resolveDepth).mockReturnValue({ depth: 3, provenance: 'cli-flag' })

      await invokeHandler({ step: 'create-prd', _: ['run'], depth: 3, auto: true })

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

      // In JSON mode, like auto mode, returns normally after prompt output
      await invokeHandler({ step: 'create-prd', _: ['run'], format: 'json' })

      // In json mode output.result is called with structured data
      expect(mockOutput.result).toHaveBeenCalledWith(
        expect.objectContaining({
          step: 'create-prd',
          status: 'in_progress',
          depth: expect.any(Number),
          nextEligible: expect.any(Array),
        }),
      )
    })
  })

  describe('--instructions flag', () => {
    it('passes inline instructions to loadInstructions', async () => {
      await invokeHandler({ step: 'create-prd', _: ['run'], instructions: 'Be thorough', auto: true })

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

      await invokeHandler({ step: 'create-prd', _: ['run'], force: true, auto: true })

      // Should return normally (success, not 4 cancellation)
      expect(process.exitCode).toBeUndefined()
    })
  })

  describe('lock release', () => {
    it('releases lock after successful run', async () => {
      vi.mocked(resolveOutputMode).mockReturnValue('interactive')
      mockOutput.confirm = vi.fn().mockResolvedValue(true)

      await invokeHandler({ step: 'create-prd', _: ['run'] })

      expect(releaseLock).toHaveBeenCalledWith(PROJECT_ROOT)
    })
  })

  describe('crash recovery: interactive mode ask_user', () => {
    function setupCrashState() {
      const stateWithInProgress = makeState(
        { 'create-prd': { status: 'in_progress', source: 'pipeline', produces: ['docs/prd.md'] } },
        { step: 'create-prd', started: '2024-01-01T00:00:00.000Z', partial_artifacts: [], actor: 'scaffold-run' },
      )
      vi.mocked(StateManager.prototype.loadState).mockReturnValue(stateWithInProgress)
      vi.mocked(analyzeCrash).mockReturnValue({
        action: 'ask_user',
        presentArtifacts: ['docs/prd.md'],
        missingArtifacts: ['docs/other.md'],
      })
      vi.mocked(resolveOutputMode).mockReturnValue('interactive')
    }

    it('marks completed when user confirms crash recovery', async () => {
      setupCrashState()
      // First confirm: crash recovery "mark as completed?" → yes
      // Second confirm: step complete? → yes (after assembly output)
      mockOutput.confirm = vi.fn()
        .mockResolvedValueOnce(true)   // crash recovery: mark as completed
        .mockResolvedValueOnce(true)   // step complete

      await invokeHandler({ step: 'create-prd', _: ['run'] })

      expect(StateManager.prototype.markCompleted).toHaveBeenCalledWith(
        'create-prd',
        [],
        'scaffold-crash-recovery',
        3,
      )
      expect(StateManager.prototype.clearInProgress).toHaveBeenCalled()
    })

    it('clears in_progress without completing when user declines crash recovery', async () => {
      setupCrashState()
      // First confirm: crash recovery "mark as completed?" → no
      // Second confirm: step complete? → yes (after assembly output)
      mockOutput.confirm = vi.fn()
        .mockResolvedValueOnce(false)  // crash recovery: do not mark completed
        .mockResolvedValueOnce(true)   // step complete

      await invokeHandler({ step: 'create-prd', _: ['run'] })

      // Should have called clearInProgress but NOT markCompleted with crash-recovery source
      const markCompletedCalls = vi.mocked(StateManager.prototype.markCompleted).mock.calls
      const crashRecoveryCalls = markCompletedCalls.filter(
        call => call[2] === 'scaffold-crash-recovery',
      )
      expect(crashRecoveryCalls).toHaveLength(0)
      expect(StateManager.prototype.clearInProgress).toHaveBeenCalled()
    })
  })

  describe('update mode: interactive confirmation', () => {
    function setupUpdateMode(warnings: Array<{ code: string; message: string }> = []) {
      vi.mocked(detectUpdateMode).mockReturnValue({
        isUpdateMode: true,
        currentDepth: 3,
        existingArtifact: {
          filePath: 'docs/prd.md',
          content: 'old content',
          previousDepth: 3,
          completionTimestamp: '2024-01-01T00:00:00.000Z',
        },
        warnings,
      })
      vi.mocked(resolveOutputMode).mockReturnValue('interactive')
    }

    it('exits 4 when user declines update mode confirmation', async () => {
      setupUpdateMode()
      // User declines re-run confirmation
      mockOutput.confirm = vi.fn().mockResolvedValueOnce(false)

      await invokeHandler({ step: 'create-prd', _: ['run'] })

      expect(process.exitCode).toBe(4)
      expect(releaseLock).toHaveBeenCalledWith(PROJECT_ROOT)
    })

    it('proceeds when user confirms depth downgrade', async () => {
      setupUpdateMode([{ code: 'ASM_DEPTH_DOWNGRADE', message: 'Depth downgraded from 4 to 3' }])
      // First confirm: re-run in update mode? → yes
      // Second confirm: depth downgrade? → yes
      // Third confirm: step complete? → yes
      mockOutput.confirm = vi.fn()
        .mockResolvedValueOnce(true)   // update mode confirmation
        .mockResolvedValueOnce(true)   // depth downgrade confirmation
        .mockResolvedValueOnce(true)   // step complete

      await invokeHandler({ step: 'create-prd', _: ['run'] })

      expect(process.exitCode).toBeUndefined()
      expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('assembled prompt text'))
    })

    it('exits 4 when user declines depth downgrade', async () => {
      setupUpdateMode([{ code: 'ASM_DEPTH_DOWNGRADE', message: 'Depth downgraded from 4 to 3' }])
      // First confirm: re-run in update mode? → yes
      // Second confirm: depth downgrade? → no
      mockOutput.confirm = vi.fn()
        .mockResolvedValueOnce(true)   // update mode confirmation
        .mockResolvedValueOnce(false)  // depth downgrade → decline

      await invokeHandler({ step: 'create-prd', _: ['run'] })

      expect(process.exitCode).toBe(4)
      expect(releaseLock).toHaveBeenCalledWith(PROJECT_ROOT)
    })

    it('outputs warnings and proceeds in auto mode with depth downgrade', async () => {
      vi.mocked(detectUpdateMode).mockReturnValue({
        isUpdateMode: true,
        currentDepth: 3,
        existingArtifact: {
          filePath: 'docs/prd.md',
          content: 'old content',
          previousDepth: 4,
          completionTimestamp: '2024-01-01T00:00:00.000Z',
        },
        warnings: [{ code: 'ASM_DEPTH_DOWNGRADE', message: 'Depth downgraded from 4 to 3' }],
      })
      vi.mocked(resolveOutputMode).mockReturnValue('auto')

      await invokeHandler({ step: 'create-prd', _: ['run'], auto: true })

      expect(mockOutput.warn).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'ASM_DEPTH_DOWNGRADE' }),
      )
      expect(process.exitCode).toBeUndefined()
    })
  })

  describe('lock warning display', () => {
    it('displays warning when acquireLock returns a warning', async () => {
      vi.mocked(acquireLock).mockReturnValue({
        acquired: true,
        warning: { code: 'LOCK_STALE_CLEARED', message: 'Stale lock cleared' },
      })

      await invokeHandler({ step: 'create-prd', _: ['run'], auto: true })

      expect(mockOutput.warn).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'LOCK_STALE_CLEARED', message: 'Stale lock cleared' }),
      )
    })
  })

  describe('interactive mode: skip marking', () => {
    it('marks step as skipped when user declines completion but confirms skip', async () => {
      vi.mocked(resolveOutputMode).mockReturnValue('interactive')
      mockOutput.confirm = vi.fn()
        .mockResolvedValueOnce(false)  // Step complete? → no
        .mockResolvedValueOnce(true)   // Mark as skipped? → yes

      await invokeHandler({ step: 'create-prd', _: ['run'] })

      expect(StateManager.prototype.markSkipped).toHaveBeenCalledWith(
        'create-prd',
        'user-cancelled',
        'scaffold-run',
      )
      expect(process.exitCode).toBe(4)
    })
  })

  describe('interactive mode: next eligible steps display', () => {
    it('displays next eligible steps after completion', async () => {
      vi.mocked(resolveOutputMode).mockReturnValue('interactive')
      vi.mocked(computeEligible).mockReturnValue(['create-arch', 'create-api'])
      mockOutput.confirm = vi.fn().mockResolvedValue(true)

      await invokeHandler({ step: 'create-prd', _: ['run'] })

      expect(mockOutput.info).toHaveBeenCalledWith(
        expect.stringContaining('Next eligible: create-arch, create-api'),
      )
    })

    it('displays "No more eligible steps" when none available', async () => {
      vi.mocked(resolveOutputMode).mockReturnValue('interactive')
      vi.mocked(computeEligible).mockReturnValue([])
      mockOutput.confirm = vi.fn().mockResolvedValue(true)

      await invokeHandler({ step: 'create-prd', _: ['run'] })

      expect(mockOutput.info).toHaveBeenCalledWith('No more eligible steps.')
    })
  })

  describe('unexpected error handling', () => {
    it('releases lock and exits 1 when assembly engine throws unexpected error', async () => {
      vi.mocked(AssemblyEngine.prototype.assemble).mockImplementation(() => {
        throw new Error('unexpected engine failure')
      })

      await invokeHandler({ step: 'create-prd', _: ['run'], auto: true })

      expect(releaseLock).toHaveBeenCalledWith(PROJECT_ROOT)
      expect(mockOutput.error).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'RUN_UNEXPECTED_ERROR',
          message: 'unexpected engine failure',
          exitCode: 1,
        }),
      )
      expect(process.exitCode).toBe(1)
    })
  })

  describe('methodology change warnings', () => {
    it('outputs methodology change warnings', async () => {
      vi.mocked(detectMethodologyChange).mockReturnValue({
        changed: true,
        stateMeta: 'deep',
        configMeta: 'mvp',
        warnings: [
          { code: 'METHODOLOGY_CHANGED', message: 'Methodology changed from deep to mvp' },
        ],
      })

      await invokeHandler({ step: 'create-prd', _: ['run'], auto: true })

      expect(mockOutput.warn).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'METHODOLOGY_CHANGED' }),
      )
    })
  })

  describe('artifact loading from completed dependencies', () => {
    it('loads artifacts from completed dependency steps', async () => {
      // Set up two-step pipeline: create-prd depends on setup-project
      const setupMeta = makeMetaPrompt({
        stepName: 'setup-project',
        frontmatter: makeFrontmatter({
          name: 'setup-project',
          phase: 'prerequisites',
          order: 0,
          dependencies: [],
          outputs: ['docs/setup.md'],
        }),
      })
      const prdMeta = makeMetaPrompt({
        stepName: 'create-prd',
        frontmatter: makeFrontmatter({
          name: 'create-prd',
          dependencies: ['setup-project'],
          outputs: ['docs/prd.md'],
        }),
      })
      const artMap = new Map([
        ['setup-project', setupMeta],
        ['create-prd', prdMeta],
      ])
      vi.mocked(discoverMetaPrompts).mockReturnValue(artMap)
      vi.mocked(discoverAllMetaPrompts).mockReturnValue(artMap)

      // setup-project is completed with produces
      const state = makeState({
        'setup-project': {
          status: 'completed',
          source: 'pipeline',
          produces: ['docs/setup.md'],
          depth: 3,
          completed_by: 'scaffold-run',
        },
        'create-prd': { status: 'pending', source: 'pipeline', produces: ['docs/prd.md'] },
      })
      vi.mocked(StateManager.prototype.loadState).mockReturnValue(state)

      // Graph with dependency
      const graph: DependencyGraph = {
        nodes: new Map([
          ['setup-project', {
            slug: 'setup-project', phase: 'prerequisites',
            order: 0, dependencies: [], enabled: true,
          }],
          ['create-prd', {
            slug: 'create-prd', phase: 'modeling',
            order: 1, dependencies: ['setup-project'], enabled: true,
          }],
        ]),
        edges: new Map([
          ['setup-project', ['create-prd']],
          ['create-prd', []],
        ]),
      }
      vi.mocked(buildGraph).mockReturnValue(graph)

      // Mock fs to return artifact content
      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        if (String(p).includes('docs/setup.md')) return true
        return false
      })
      vi.mocked(fs.readFileSync).mockImplementation((p: fs.PathOrFileDescriptor, _opts?: unknown) => {
        if (String(p).includes('docs/setup.md')) return '# Setup Document\nContent here.'
        throw new Error(`ENOENT: no such file: ${String(p)}`)
      })

      vi.mocked(resolveOutputMode).mockReturnValue('auto')

      await invokeHandler({ step: 'create-prd', _: ['run'], auto: true })

      // Verify the assembly engine received artifacts
      expect(AssemblyEngine.prototype.assemble).toHaveBeenCalledWith(
        'create-prd',
        expect.objectContaining({
          artifacts: expect.arrayContaining([
            expect.objectContaining({
              stepName: 'setup-project',
              filePath: 'docs/setup.md',
              content: '# Setup Document\nContent here.',
            }),
          ]),
        }),
      )
      expect(process.exitCode).toBeUndefined()
    })
  })

  describe('reads artifact gathering', () => {
    it('gathers artifacts from completed read targets', async () => {
      // Set up pipeline: create-prd reads from setup-project (not a dependency)
      const setupMeta = makeMetaPrompt({
        stepName: 'setup-project',
        frontmatter: makeFrontmatter({
          name: 'setup-project',
          phase: 'prerequisites',
          order: 0,
          dependencies: [],
          outputs: ['docs/setup.md'],
        }),
      })
      const prdMeta = makeMetaPrompt({
        stepName: 'create-prd',
        frontmatter: makeFrontmatter({
          name: 'create-prd',
          dependencies: [],
          reads: ['setup-project'],
          outputs: ['docs/prd.md'],
        }),
      })
      const readsMap1 = new Map([
        ['setup-project', setupMeta],
        ['create-prd', prdMeta],
      ])
      vi.mocked(discoverMetaPrompts).mockReturnValue(readsMap1)
      vi.mocked(discoverAllMetaPrompts).mockReturnValue(readsMap1)

      const state = makeState({
        'setup-project': {
          status: 'completed',
          source: 'pipeline',
          produces: ['docs/setup.md'],
          depth: 3,
          completed_by: 'scaffold-run',
        },
        'create-prd': { status: 'pending', source: 'pipeline', produces: ['docs/prd.md'] },
      })
      vi.mocked(StateManager.prototype.loadState).mockReturnValue(state)

      const graph: DependencyGraph = {
        nodes: new Map([
          ['setup-project', {
            slug: 'setup-project', phase: 'prerequisites',
            order: 0, dependencies: [], enabled: true,
          }],
          ['create-prd', {
            slug: 'create-prd', phase: 'modeling',
            order: 1, dependencies: [], enabled: true,
          }],
        ]),
        edges: new Map([['setup-project', []], ['create-prd', []]]),
      }
      vi.mocked(buildGraph).mockReturnValue(graph)

      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        if (String(p).includes('docs/setup.md')) return true
        return false
      })
      vi.mocked(fs.readFileSync).mockImplementation((p: fs.PathOrFileDescriptor, _opts?: unknown) => {
        if (String(p).includes('docs/setup.md')) return '# Setup\nContent.'
        throw new Error(`ENOENT: no such file: ${String(p)}`)
      })

      vi.mocked(resolveOutputMode).mockReturnValue('auto')

      await invokeHandler({ step: 'create-prd', _: ['run'], auto: true })

      expect(AssemblyEngine.prototype.assemble).toHaveBeenCalledWith(
        'create-prd',
        expect.objectContaining({
          artifacts: expect.arrayContaining([
            expect.objectContaining({
              stepName: 'setup-project',
              filePath: 'docs/setup.md',
              content: '# Setup\nContent.',
            }),
          ]),
        }),
      )
    })

    it('silently skips reads from pending (not completed) steps', async () => {
      const setupMeta = makeMetaPrompt({
        stepName: 'setup-project',
        frontmatter: makeFrontmatter({
          name: 'setup-project',
          phase: 'prerequisites',
          order: 0,
          dependencies: [],
          outputs: ['docs/setup.md'],
        }),
      })
      const prdMeta = makeMetaPrompt({
        stepName: 'create-prd',
        frontmatter: makeFrontmatter({
          name: 'create-prd',
          dependencies: [],
          reads: ['setup-project'],
          outputs: ['docs/prd.md'],
        }),
      })
      const readsMap2 = new Map([
        ['setup-project', setupMeta],
        ['create-prd', prdMeta],
      ])
      vi.mocked(discoverMetaPrompts).mockReturnValue(readsMap2)
      vi.mocked(discoverAllMetaPrompts).mockReturnValue(readsMap2)

      // setup-project is pending (not completed)
      const state = makeState({
        'setup-project': { status: 'pending', source: 'pipeline', produces: ['docs/setup.md'] },
        'create-prd': { status: 'pending', source: 'pipeline', produces: ['docs/prd.md'] },
      })
      vi.mocked(StateManager.prototype.loadState).mockReturnValue(state)

      const graph: DependencyGraph = {
        nodes: new Map([
          ['setup-project', {
            slug: 'setup-project', phase: 'prerequisites',
            order: 0, dependencies: [], enabled: true,
          }],
          ['create-prd', {
            slug: 'create-prd', phase: 'modeling',
            order: 1, dependencies: [], enabled: true,
          }],
        ]),
        edges: new Map([['setup-project', []], ['create-prd', []]]),
      }
      vi.mocked(buildGraph).mockReturnValue(graph)

      vi.mocked(resolveOutputMode).mockReturnValue('auto')

      await invokeHandler({ step: 'create-prd', _: ['run'], auto: true })

      // Should have empty artifacts (reads target not completed)
      expect(AssemblyEngine.prototype.assemble).toHaveBeenCalledWith(
        'create-prd',
        expect.objectContaining({
          artifacts: [],
        }),
      )
    })

    it('silently skips disabled read targets', async () => {
      const setupMeta = makeMetaPrompt({
        stepName: 'setup-project',
        frontmatter: makeFrontmatter({
          name: 'setup-project',
          phase: 'prerequisites',
          order: 0,
          dependencies: [],
          outputs: ['docs/setup.md'],
        }),
      })
      const prdMeta = makeMetaPrompt({
        stepName: 'create-prd',
        frontmatter: makeFrontmatter({
          name: 'create-prd',
          dependencies: [],
          reads: ['setup-project'],
          outputs: ['docs/prd.md'],
        }),
      })
      const readsMap3 = new Map([
        ['setup-project', setupMeta],
        ['create-prd', prdMeta],
      ])
      vi.mocked(discoverMetaPrompts).mockReturnValue(readsMap3)
      vi.mocked(discoverAllMetaPrompts).mockReturnValue(readsMap3)

      const state = makeState({
        'setup-project': {
          status: 'completed', source: 'pipeline',
          produces: ['docs/setup.md'], depth: 3, completed_by: 'scaffold-run',
        },
        'create-prd': { status: 'pending', source: 'pipeline', produces: ['docs/prd.md'] },
      })
      vi.mocked(StateManager.prototype.loadState).mockReturnValue(state)

      // setup-project is disabled in graph (overlay disabled)
      const graph: DependencyGraph = {
        nodes: new Map([
          ['setup-project', {
            slug: 'setup-project', phase: 'prerequisites',
            order: 0, dependencies: [], enabled: false,
          }],
          ['create-prd', { slug: 'create-prd', phase: 'modeling', order: 1, dependencies: [], enabled: true }],
        ]),
        edges: new Map([['setup-project', []], ['create-prd', []]]),
      }
      vi.mocked(buildGraph).mockReturnValue(graph)

      vi.mocked(resolveOutputMode).mockReturnValue('auto')

      await invokeHandler({ step: 'create-prd', _: ['run'], auto: true })

      // Disabled read target should be skipped — no artifacts gathered
      expect(AssemblyEngine.prototype.assemble).toHaveBeenCalledWith(
        'create-prd',
        expect.objectContaining({
          artifacts: [],
        }),
      )
    })

    it('deduplicates reads artifacts against dependency artifacts', async () => {
      // setup-project is both a dependency and a read target
      const setupMeta = makeMetaPrompt({
        stepName: 'setup-project',
        frontmatter: makeFrontmatter({
          name: 'setup-project',
          phase: 'prerequisites',
          order: 0,
          dependencies: [],
          outputs: ['docs/setup.md'],
        }),
      })
      const prdMeta = makeMetaPrompt({
        stepName: 'create-prd',
        frontmatter: makeFrontmatter({
          name: 'create-prd',
          dependencies: ['setup-project'],
          reads: ['setup-project'],  // also in reads
          outputs: ['docs/prd.md'],
        }),
      })
      const dedupMap = new Map([
        ['setup-project', setupMeta],
        ['create-prd', prdMeta],
      ])
      vi.mocked(discoverMetaPrompts).mockReturnValue(dedupMap)
      vi.mocked(discoverAllMetaPrompts).mockReturnValue(dedupMap)

      const state = makeState({
        'setup-project': {
          status: 'completed',
          source: 'pipeline',
          produces: ['docs/setup.md'],
          depth: 3,
          completed_by: 'scaffold-run',
        },
        'create-prd': { status: 'pending', source: 'pipeline', produces: ['docs/prd.md'] },
      })
      vi.mocked(StateManager.prototype.loadState).mockReturnValue(state)

      const graph: DependencyGraph = {
        nodes: new Map([
          ['setup-project', {
            slug: 'setup-project', phase: 'prerequisites',
            order: 0, dependencies: [], enabled: true,
          }],
          ['create-prd', {
            slug: 'create-prd', phase: 'modeling',
            order: 1, dependencies: ['setup-project'], enabled: true,
          }],
        ]),
        edges: new Map([
          ['setup-project', ['create-prd']],
          ['create-prd', []],
        ]),
      }
      vi.mocked(buildGraph).mockReturnValue(graph)

      vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => {
        if (String(p).includes('docs/setup.md')) return true
        return false
      })
      vi.mocked(fs.readFileSync).mockImplementation((p: fs.PathOrFileDescriptor, _opts?: unknown) => {
        if (String(p).includes('docs/setup.md')) return '# Setup\nContent.'
        throw new Error(`ENOENT: no such file: ${String(p)}`)
      })

      vi.mocked(resolveOutputMode).mockReturnValue('auto')

      await invokeHandler({ step: 'create-prd', _: ['run'], auto: true })

      // Should only have one artifact (deduplicated)
      const assembleCall = vi.mocked(AssemblyEngine.prototype.assemble).mock.calls[0]
      const artifacts = (assembleCall?.[1] as { artifacts: unknown[] })?.artifacts ?? []
      expect(artifacts).toHaveLength(1)
    })
  })

  describe('disabled dependency bypass', () => {
    it('does not return DEP_UNMET when dependency is disabled in graph', async () => {
      // create-arch depends on create-prd, but create-prd is disabled
      const prdMeta = makeMetaPrompt({
        stepName: 'create-prd',
        frontmatter: makeFrontmatter({
          name: 'create-prd',
          dependencies: [],
          outputs: ['docs/prd.md'],
        }),
      })
      const archMeta = makeMetaPrompt({
        stepName: 'create-arch',
        frontmatter: makeFrontmatter({
          name: 'create-arch',
          phase: 'architecture',
          order: 2,
          dependencies: ['create-prd'],
          outputs: ['docs/arch.md'],
        }),
      })
      const bypassMap = new Map([
        ['create-prd', prdMeta],
        ['create-arch', archMeta],
      ])
      vi.mocked(discoverMetaPrompts).mockReturnValue(bypassMap)
      vi.mocked(discoverAllMetaPrompts).mockReturnValue(bypassMap)

      const state = makeState({
        'create-prd': { status: 'pending', source: 'pipeline', produces: [] },
        'create-arch': { status: 'pending', source: 'pipeline', produces: [] },
      })
      vi.mocked(StateManager.prototype.loadState).mockReturnValue(state)

      // create-prd is disabled in graph (overlay disabled it)
      const graph: DependencyGraph = {
        nodes: new Map([
          ['create-prd', {
            slug: 'create-prd', phase: 'modeling',
            order: 1, dependencies: [], enabled: false,
          }],
          ['create-arch', {
            slug: 'create-arch', phase: 'architecture',
            order: 2, dependencies: ['create-prd'], enabled: true,
          }],
        ]),
        edges: new Map([['create-prd', ['create-arch']], ['create-arch', []]]),
      }
      vi.mocked(buildGraph).mockReturnValue(graph)

      vi.mocked(resolveOutputMode).mockReturnValue('auto')

      await invokeHandler({ step: 'create-arch', _: ['run'], auto: true })

      // Should NOT have set exitCode to 2 (DEP_UNMET)
      // It should proceed to assembly and return normally
      expect(process.exitCode).toBeUndefined()
    })
  })

  describe('overlay application', () => {
    it('applies overlay when resolveOverlayState returns disabled steps', async () => {
      // Config with projectType: 'game'
      const config = makeConfig({
        project: { projectType: 'game' },
      })
      vi.mocked(loadConfig).mockReturnValue({ config, errors: [], warnings: [] })

      // Mock resolveOverlayState to return overlay-merged data with create-prd disabled
      vi.mocked(resolveOverlayState).mockReturnValue({
        steps: {
          'create-prd': { enabled: false },
        },
        knowledge: { 'create-prd': [] },
        reads: { 'create-prd': [] },
        dependencies: { 'create-prd': [] },
      })

      vi.mocked(resolveOutputMode).mockReturnValue('auto')

      await invokeHandler({ step: 'create-prd', _: ['run'], auto: true })

      // Verify resolveOverlayState was called (overlay resolution delegated to resolver)
      expect(resolveOverlayState).toHaveBeenCalled()

      // Verify buildGraph received merged steps (with overlay applied)
      expect(buildGraph).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Map),
        expect.any(Object),
      )
      // The presetStepsMap passed to buildGraph should contain overlay-merged steps
      const buildGraphCall = vi.mocked(buildGraph).mock.calls[0]
      const stepsMap = buildGraphCall[1] as Map<string, { enabled: boolean }>
      expect(stepsMap.get('create-prd')).toEqual({ enabled: false })
    })

    it('passes preset steps through when config has no projectType', async () => {
      const config = makeConfig()  // no project.projectType
      vi.mocked(loadConfig).mockReturnValue({ config, errors: [], warnings: [] })

      vi.mocked(resolveOutputMode).mockReturnValue('auto')

      await invokeHandler({ step: 'create-prd', _: ['run'], auto: true })

      // resolveOverlayState is still called (by the resolver) but with no projectType
      // it returns the preset steps unchanged
      expect(resolveOverlayState).toHaveBeenCalled()
    })
  })
})
