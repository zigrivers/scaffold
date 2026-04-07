/**
 * E2E tests for game pipeline — exercises wizard init with projectType 'game',
 * verifies config.yml has gameConfig defaults, and confirms the overlay
 * enables game-specific steps while disabling web-centric ones.
 *
 * Follows the same pattern as init.test.ts: real temp dirs, mocked
 * detectProjectMode and discoverMetaPrompts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import yaml from 'js-yaml'

// ---------------------------------------------------------------------------
// Hoisted mocks — must appear before real imports
// ---------------------------------------------------------------------------

vi.mock('../../src/project/detector.js', () => ({
  detectProjectMode: vi.fn(() => ({
    mode: 'greenfield',
    signals: [],
    methodologySuggestion: 'deep',
    sourceFileCount: 0,
  })),
}))

vi.mock('../../src/core/assembly/meta-prompt-loader.js', () => ({
  discoverMetaPrompts: vi.fn(() => new Map()),
  discoverAllMetaPrompts: vi.fn(() => new Map()),
}))

// ---------------------------------------------------------------------------
// Real imports (after mock declarations)
// ---------------------------------------------------------------------------

import { runWizard } from '../wizard/wizard.js'
import { loadConfig } from '../config/loader.js'
import { StateManager } from '../state/state-manager.js'
import { loadAllPresets } from '../core/assembly/preset-loader.js'
import { resolveOverlayState } from '../core/assembly/overlay-state-resolver.js'
import { getPackagePipelineDir, getPackageMethodologyDir } from '../utils/fs.js'
import type { MetaPromptFile } from '../types/index.js'
import type { OverlayState } from '../core/assembly/overlay-state-resolver.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-e2e-game-'))
}

function createMockOutput() {
  return {
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
  }
}

/**
 * Discover real meta-prompts from the package pipeline directory
 * and build a Map suitable for resolveOverlayState.
 * Uses vi.importActual to bypass the vi.mock and get the real loader.
 */
async function discoverRealMetaPrompts(): Promise<Map<string, MetaPromptFile>> {
  const pipelineDir = getPackagePipelineDir()
  const actual = await vi.importActual<typeof import('../core/assembly/meta-prompt-loader.js')>(
    '../core/assembly/meta-prompt-loader.js',
  )
  return actual.discoverMetaPrompts(pipelineDir)
}

/**
 * Resolve the game overlay with a given methodology against the real pipeline.
 * Shared helper to reduce boilerplate across overlay tests.
 */
async function resolveGameOverlay(
  methodology: 'deep' | 'mvp' = 'deep',
): Promise<{ overlayState: OverlayState; realMetaPrompts: Map<string, MetaPromptFile> }> {
  const methodologyDir = getPackageMethodologyDir()
  const realMetaPrompts = await discoverRealMetaPrompts()
  const knownSteps = [...realMetaPrompts.keys()]
  const presets = loadAllPresets(methodologyDir, knownSteps)
  const output = createMockOutput()

  const preset = methodology === 'mvp' ? presets.mvp : presets.deep
  const overlayState = resolveOverlayState({
    config: {
      version: 2,
      methodology,
      platforms: ['claude-code'],
      project: { projectType: 'game' },
    },
    methodologyDir,
    metaPrompts: realMetaPrompts,
    presetSteps: preset?.steps ?? {},
    output,
  })

  return { overlayState, realMetaPrompts }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('game pipeline E2E', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTempDir()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  // Test 1: Init with projectType game creates config with gameConfig
  it('init with projectType game creates config.yml with gameConfig defaults', async () => {
    const output = createMockOutput()
    const result = await runWizard({
      projectRoot: tmpDir,
      projectType: 'game',
      methodology: 'deep',
      force: false,
      auto: true,
      output,
    })

    expect(result.success).toBe(true)
    expect(result.methodology).toBe('deep')

    // Read config.yml and verify game fields
    const { config } = loadConfig(tmpDir, [])
    expect(config).not.toBeNull()
    expect(config!.methodology).toBe('deep')
    expect(config!.project?.projectType).toBe('game')
    expect(config!.project?.gameConfig).toBeDefined()
    expect(config!.project?.gameConfig?.engine).toBe('custom')
  })

  // Test 2: gameConfig defaults match Zod schema defaults
  it('gameConfig has correct Zod schema defaults in auto mode', async () => {
    const output = createMockOutput()
    await runWizard({
      projectRoot: tmpDir,
      projectType: 'game',
      methodology: 'deep',
      force: false,
      auto: true,
      output,
    })

    const { config } = loadConfig(tmpDir, [])
    const gc = config!.project!.gameConfig!

    expect(gc.engine).toBe('custom')
    expect(gc.multiplayerMode).toBe('none')
    expect(gc.narrative).toBe('none')
    expect(gc.contentStructure).toBe('discrete')
    expect(gc.economy).toBe('none')
    expect(gc.onlineServices).toEqual([])
    expect(gc.persistence).toBe('progression')
    expect(gc.targetPlatforms).toEqual(['pc'])
    expect(gc.supportedLocales).toEqual(['en'])
    expect(gc.hasModding).toBe(false)
    expect(gc.npcAiComplexity).toBe('none')
  })

  // Test 3: config.yml round-trips through YAML correctly
  it('config.yml round-trips projectType and gameConfig through YAML', async () => {
    const output = createMockOutput()
    await runWizard({
      projectRoot: tmpDir,
      projectType: 'game',
      methodology: 'deep',
      force: false,
      auto: true,
      output,
    })

    // Read raw YAML to verify structure
    const configPath = path.join(tmpDir, '.scaffold', 'config.yml')
    const raw = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
    const project = raw['project'] as Record<string, unknown>
    expect(project['projectType']).toBe('game')
    expect(project['gameConfig']).toBeDefined()
    const gc = project['gameConfig'] as Record<string, unknown>
    expect(gc['engine']).toBe('custom')
  })

  // Test 4: State has correct structure after game init
  it('state.json has correct structure after game init', async () => {
    const output = createMockOutput()
    await runWizard({
      projectRoot: tmpDir,
      projectType: 'game',
      methodology: 'deep',
      force: false,
      auto: true,
      output,
    })

    const stateManager = new StateManager(tmpDir, () => [])
    const state = stateManager.loadState()
    expect(state['schema-version']).toBe(1)
    expect(state.config_methodology).toBe('deep')
    expect(state['init-mode']).toBe('greenfield')
  })

  // Test 5: Overlay enables game-design-document step
  it('overlay enables game-design-document in step overrides', async () => {
    const { overlayState } = await resolveGameOverlay()

    expect(overlayState.steps['game-design-document']).toBeDefined()
    expect(overlayState.steps['game-design-document']!.enabled).toBe(true)
  })

  // Test 6: Overlay disables design-system for game projects
  it('overlay disables design-system for game projects', async () => {
    const { overlayState } = await resolveGameOverlay()

    expect(overlayState.steps['design-system']).toBeDefined()
    expect(overlayState.steps['design-system']!.enabled).toBe(false)
  })

  // Test 7: Overlay enables all 12 always-on game steps
  it('overlay enables all 12 always-on game steps', async () => {
    const { overlayState } = await resolveGameOverlay()

    const alwaysOnSteps = [
      'game-design-document',
      'review-gdd',
      'performance-budgets',
      'game-accessibility',
      'input-controls-spec',
      'game-ui-spec',
      'review-game-ui',
      'content-structure-design',
      'art-bible',
      'audio-design',
      'playtest-plan',
      'analytics-telemetry',
    ]

    for (const step of alwaysOnSteps) {
      expect(overlayState.steps[step], `${step} should be enabled`).toBeDefined()
      expect(overlayState.steps[step]!.enabled, `${step} should be enabled`).toBe(true)
    }
  })

  // Test 8: Overlay disables all 3 web-centric steps
  it('overlay disables ux-spec, review-ux, and design-system for game projects', async () => {
    const { overlayState } = await resolveGameOverlay()

    const disabledSteps = ['design-system', 'ux-spec', 'review-ux']
    for (const step of disabledSteps) {
      expect(overlayState.steps[step], `${step} should be present`).toBeDefined()
      expect(overlayState.steps[step]!.enabled, `${step} should be disabled`).toBe(false)
    }
  })

  // Test 9: Overlay injects game knowledge into existing steps
  it('overlay injects game knowledge entries into existing pipeline steps', async () => {
    const { overlayState } = await resolveGameOverlay()

    // create-prd should have game-design-document knowledge appended
    expect(overlayState.knowledge['create-prd']).toBeDefined()
    expect(overlayState.knowledge['create-prd']).toContain('game-design-document')

    // tech-stack should have game-engine-selection knowledge
    expect(overlayState.knowledge['tech-stack']).toBeDefined()
    expect(overlayState.knowledge['tech-stack']).toContain('game-engine-selection')
  })

  // Test 10: Overlay remaps reads for game projects
  it('overlay remaps reads references from web to game equivalents', async () => {
    const { overlayState } = await resolveGameOverlay()

    // implementation-plan should have ux-spec replaced with game-ui-spec
    if (overlayState.reads['implementation-plan']) {
      expect(overlayState.reads['implementation-plan']).not.toContain('ux-spec')
      expect(overlayState.reads['implementation-plan']).toContain('game-ui-spec')
    }
  })

  // Test 11: Non-game project does not get overlay applied
  it('non-game projectType does not enable game steps', async () => {
    const output = createMockOutput()
    await runWizard({
      projectRoot: tmpDir,
      projectType: 'web-app',
      methodology: 'deep',
      force: false,
      auto: true,
      webAppFlags: { webRendering: 'spa' },
      output,
    })

    const { config } = loadConfig(tmpDir, [])
    expect(config).not.toBeNull()
    expect(config!.project?.projectType).toBe('web-app')
    expect(config!.project?.gameConfig).toBeUndefined()
  })

  // Test 12: Conditional game steps have conditional flag set
  it('conditional game steps have conditional: if-needed', async () => {
    const { overlayState } = await resolveGameOverlay()

    const conditionalSteps = [
      'narrative-bible',
      'ai-behavior-design',
      'economy-design',
      'localization-plan',
      'online-services-spec',
      'modding-ugc-spec',
      'live-ops-plan',
    ]

    for (const step of conditionalSteps) {
      expect(overlayState.steps[step], `${step} should exist`).toBeDefined()
      expect(overlayState.steps[step]!.enabled, `${step} should be enabled`).toBe(true)
      expect(overlayState.steps[step]!.conditional, `${step} should be conditional`).toBe('if-needed')
    }
  })

  // Test 13: MVP methodology with game overlay works correctly
  it('MVP methodology with game overlay enables game steps', async () => {
    const { overlayState } = await resolveGameOverlay('mvp')

    // game-design-document should still be enabled even with mvp preset
    expect(overlayState.steps['game-design-document']?.enabled).toBe(true)
    // design-system should still be disabled by overlay
    expect(overlayState.steps['design-system']?.enabled).toBe(false)
  })
})
