/**
 * E2E integration tests for project-type overlay flow:
 *   init → config.yml → overlay resolution → knowledge injection
 *
 * Tests the full pipeline for web-app, backend, and cli project types:
 * 1. Init creates config with project-type-specific config block
 * 2. Config validates through ConfigSchema
 * 3. Overlay loads and resolves against real pipeline meta-prompts
 * 4. Knowledge entries are injected into the correct steps
 *
 * Follows the same pattern as game-pipeline.test.ts: real temp dirs, mocked
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
import { ConfigSchema } from '../config/schema.js'
import { loadAllPresets } from '../core/assembly/preset-loader.js'
import { resolveOverlayState } from '../core/assembly/overlay-state-resolver.js'
import { loadOverlay } from '../core/assembly/overlay-loader.js'
import { getPackagePipelineDir, getPackageMethodologyDir } from '../utils/fs.js'
import type { MetaPromptFile } from '../types/index.js'
import type { OverlayState } from '../core/assembly/overlay-state-resolver.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-e2e-overlay-'))
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
 * Discover real meta-prompts from the package pipeline directory.
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
 * Resolve an overlay with a given project type and methodology against the real pipeline.
 */
async function resolveProjectOverlay(
  projectType: 'web-app' | 'backend' | 'cli',
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
      project: { projectType },
    },
    methodologyDir,
    metaPrompts: realMetaPrompts,
    presetSteps: preset?.steps ?? {},
    output,
  })

  return { overlayState, realMetaPrompts }
}

// ---------------------------------------------------------------------------
// Tests — Web-app
// ---------------------------------------------------------------------------

describe('web-app overlay integration', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTempDir()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  // Test 1: Config with web-app + webAppConfig validates through ConfigSchema
  it('web-app config with webAppConfig validates through ConfigSchema', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        projectType: 'web-app',
        webAppConfig: { renderingStrategy: 'ssr' },
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      const project = result.data.project as Record<string, unknown>
      expect(project['projectType']).toBe('web-app')
      const wac = project['webAppConfig'] as Record<string, unknown>
      expect(wac['renderingStrategy']).toBe('ssr')
      expect(wac['deployTarget']).toBe('serverless')  // default
    }
  })

  // Test 2: Init with projectType web-app creates config with webAppConfig
  it('init with projectType web-app creates config.yml with webAppConfig defaults', async () => {
    const output = createMockOutput()
    const result = await runWizard({
      projectRoot: tmpDir,
      projectType: 'web-app',
      webRendering: 'ssr',
      methodology: 'deep',
      force: false,
      auto: true,
      output,
    })

    expect(result.success).toBe(true)

    const { config } = loadConfig(tmpDir, [])
    expect(config).not.toBeNull()
    expect(config!.methodology).toBe('deep')
    expect(config!.project?.projectType).toBe('web-app')
    expect(config!.project?.webAppConfig).toBeDefined()
    expect(config!.project?.webAppConfig?.renderingStrategy).toBe('ssr')
  })

  // Test 3: config.yml round-trips through YAML correctly
  it('config.yml round-trips projectType and webAppConfig through YAML', async () => {
    const output = createMockOutput()
    await runWizard({
      projectRoot: tmpDir,
      projectType: 'web-app',
      webRendering: 'spa',
      methodology: 'deep',
      force: false,
      auto: true,
      output,
    })

    const configPath = path.join(tmpDir, '.scaffold', 'config.yml')
    const raw = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
    const project = raw['project'] as Record<string, unknown>
    expect(project['projectType']).toBe('web-app')
    expect(project['webAppConfig']).toBeDefined()
    const wac = project['webAppConfig'] as Record<string, unknown>
    expect(wac['renderingStrategy']).toBe('spa')
  })

  // Test 4: Overlay loads successfully from content/methodology
  it('web-app overlay loads without errors', () => {
    const methodologyDir = getPackageMethodologyDir()
    const overlayPath = path.join(methodologyDir, 'web-app-overlay.yml')
    const { overlay, errors } = loadOverlay(overlayPath)
    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.projectType).toBe('web-app')
    expect(Object.keys(overlay!.knowledgeOverrides).length).toBeGreaterThan(0)
  })

  // Test 5: Overlay injects web-app knowledge into architecture step
  it('overlay injects web-app-architecture into system-architecture step', async () => {
    const { overlayState } = await resolveProjectOverlay('web-app')

    expect(overlayState.knowledge['system-architecture']).toBeDefined()
    expect(overlayState.knowledge['system-architecture']).toContain('web-app-architecture')
    expect(overlayState.knowledge['system-architecture']).toContain('web-app-deployment')
  })

  // Test 6: Overlay injects knowledge into tech-stack step
  it('overlay injects web-app knowledge into tech-stack step', async () => {
    const { overlayState } = await resolveProjectOverlay('web-app')

    expect(overlayState.knowledge['tech-stack']).toBeDefined()
    expect(overlayState.knowledge['tech-stack']).toContain('web-app-rendering-strategies')
    expect(overlayState.knowledge['tech-stack']).toContain('web-app-deployment')
    expect(overlayState.knowledge['tech-stack']).toContain('web-app-auth-patterns')
  })

  // Test 7: Overlay injects knowledge into testing steps
  it('overlay injects web-app-testing into TDD and e2e steps', async () => {
    const { overlayState } = await resolveProjectOverlay('web-app')

    expect(overlayState.knowledge['tdd']).toBeDefined()
    expect(overlayState.knowledge['tdd']).toContain('web-app-testing')

    expect(overlayState.knowledge['add-e2e-testing']).toBeDefined()
    expect(overlayState.knowledge['add-e2e-testing']).toContain('web-app-testing')
  })

  // Test 8: Overlay injects knowledge into foundational steps
  it('overlay injects web-app knowledge into foundational steps', async () => {
    const { overlayState } = await resolveProjectOverlay('web-app')

    expect(overlayState.knowledge['create-prd']).toContain('web-app-requirements')
    expect(overlayState.knowledge['coding-standards']).toContain('web-app-conventions')
    expect(overlayState.knowledge['project-structure']).toContain('web-app-project-structure')
  })

  // Test 9: No step overrides (web-app overlay is knowledge-only)
  it('web-app overlay does not override step enablement', async () => {
    const { overlayState } = await resolveProjectOverlay('web-app')

    // web-app overlay has no step-overrides section
    // All steps should match the deep preset exactly
    const methodologyDir = getPackageMethodologyDir()
    const realMetaPrompts = await discoverRealMetaPrompts()
    const knownSteps = [...realMetaPrompts.keys()]
    const presets = loadAllPresets(methodologyDir, knownSteps)
    const deepSteps = presets.deep?.steps ?? {}

    for (const [stepName, entry] of Object.entries(deepSteps)) {
      expect(overlayState.steps[stepName]?.enabled, `${stepName} enablement should match preset`).toBe(entry.enabled)
    }
  })

  // Test 10: MVP methodology with web-app overlay works
  it('MVP methodology with web-app overlay injects knowledge', async () => {
    const { overlayState } = await resolveProjectOverlay('web-app', 'mvp')

    expect(overlayState.knowledge['system-architecture']).toContain('web-app-architecture')
    expect(overlayState.knowledge['tech-stack']).toContain('web-app-rendering-strategies')
  })
})

// ---------------------------------------------------------------------------
// Tests — Backend
// ---------------------------------------------------------------------------

describe('backend overlay integration', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTempDir()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  // Test 1: Config with backend + backendConfig validates through ConfigSchema
  it('backend config with backendConfig validates through ConfigSchema', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        projectType: 'backend',
        backendConfig: { apiStyle: 'rest' },
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      const project = result.data.project as Record<string, unknown>
      expect(project['projectType']).toBe('backend')
      const bc = project['backendConfig'] as Record<string, unknown>
      expect(bc['apiStyle']).toBe('rest')
      expect(bc['dataStore']).toEqual(['relational'])  // default
      expect(bc['deployTarget']).toBe('container')     // default
    }
  })

  // Test 2: Init with projectType backend creates config with backendConfig
  it('init with projectType backend creates config.yml with backendConfig defaults', async () => {
    const output = createMockOutput()
    const result = await runWizard({
      projectRoot: tmpDir,
      projectType: 'backend',
      backendApiStyle: 'rest',
      methodology: 'deep',
      force: false,
      auto: true,
      output,
    })

    expect(result.success).toBe(true)

    const { config } = loadConfig(tmpDir, [])
    expect(config).not.toBeNull()
    expect(config!.project?.projectType).toBe('backend')
    expect(config!.project?.backendConfig).toBeDefined()
    expect(config!.project?.backendConfig?.apiStyle).toBe('rest')
  })

  // Test 3: config.yml round-trips through YAML correctly
  it('config.yml round-trips projectType and backendConfig through YAML', async () => {
    const output = createMockOutput()
    await runWizard({
      projectRoot: tmpDir,
      projectType: 'backend',
      backendApiStyle: 'graphql',
      methodology: 'deep',
      force: false,
      auto: true,
      output,
    })

    const configPath = path.join(tmpDir, '.scaffold', 'config.yml')
    const raw = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
    const project = raw['project'] as Record<string, unknown>
    expect(project['projectType']).toBe('backend')
    expect(project['backendConfig']).toBeDefined()
    const bc = project['backendConfig'] as Record<string, unknown>
    expect(bc['apiStyle']).toBe('graphql')
  })

  // Test 4: Overlay loads successfully from content/methodology
  it('backend overlay loads without errors', () => {
    const methodologyDir = getPackageMethodologyDir()
    const overlayPath = path.join(methodologyDir, 'backend-overlay.yml')
    const { overlay, errors } = loadOverlay(overlayPath)
    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.projectType).toBe('backend')
    expect(Object.keys(overlay!.knowledgeOverrides).length).toBeGreaterThan(0)
  })

  // Test 5: Overlay injects backend knowledge into architecture step
  it('overlay injects backend-architecture into system-architecture step', async () => {
    const { overlayState } = await resolveProjectOverlay('backend')

    expect(overlayState.knowledge['system-architecture']).toBeDefined()
    expect(overlayState.knowledge['system-architecture']).toContain('backend-architecture')
    expect(overlayState.knowledge['system-architecture']).toContain('backend-async-patterns')
  })

  // Test 6: Overlay injects knowledge into tech-stack step
  it('overlay injects backend knowledge into tech-stack step', async () => {
    const { overlayState } = await resolveProjectOverlay('backend')

    expect(overlayState.knowledge['tech-stack']).toBeDefined()
    expect(overlayState.knowledge['tech-stack']).toContain('backend-architecture')
    expect(overlayState.knowledge['tech-stack']).toContain('backend-api-design')
    expect(overlayState.knowledge['tech-stack']).toContain('backend-auth-patterns')
  })

  // Test 7: Overlay injects knowledge into testing steps
  it('overlay injects backend-testing into TDD and e2e steps', async () => {
    const { overlayState } = await resolveProjectOverlay('backend')

    expect(overlayState.knowledge['tdd']).toBeDefined()
    expect(overlayState.knowledge['tdd']).toContain('backend-testing')

    expect(overlayState.knowledge['add-e2e-testing']).toBeDefined()
    expect(overlayState.knowledge['add-e2e-testing']).toContain('backend-testing')
  })

  // Test 8: Overlay injects knowledge into foundational steps
  it('overlay injects backend knowledge into foundational steps', async () => {
    const { overlayState } = await resolveProjectOverlay('backend')

    expect(overlayState.knowledge['create-prd']).toContain('backend-requirements')
    expect(overlayState.knowledge['coding-standards']).toContain('backend-conventions')
    expect(overlayState.knowledge['project-structure']).toContain('backend-project-structure')
  })

  // Test 9: Overlay injects knowledge into operations step
  it('overlay injects backend knowledge into operations step', async () => {
    const { overlayState } = await resolveProjectOverlay('backend')

    expect(overlayState.knowledge['operations']).toBeDefined()
    expect(overlayState.knowledge['operations']).toContain('backend-deployment')
    expect(overlayState.knowledge['operations']).toContain('backend-observability')
    expect(overlayState.knowledge['operations']).toContain('backend-async-patterns')
  })

  // Test 10: MVP methodology with backend overlay works
  it('MVP methodology with backend overlay injects knowledge', async () => {
    const { overlayState } = await resolveProjectOverlay('backend', 'mvp')

    expect(overlayState.knowledge['system-architecture']).toContain('backend-architecture')
    expect(overlayState.knowledge['tech-stack']).toContain('backend-api-design')
  })
})

// ---------------------------------------------------------------------------
// Tests — CLI
// ---------------------------------------------------------------------------

describe('cli overlay integration', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTempDir()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  // Test 1: Config with cli + cliConfig validates through ConfigSchema
  it('cli config with cliConfig validates through ConfigSchema', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        projectType: 'cli',
        cliConfig: { interactivity: 'hybrid' },
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      const project = result.data.project as Record<string, unknown>
      expect(project['projectType']).toBe('cli')
      const cc = project['cliConfig'] as Record<string, unknown>
      expect(cc['interactivity']).toBe('hybrid')
      expect(cc['distributionChannels']).toEqual(['package-manager'])  // default
      expect(cc['hasStructuredOutput']).toBe(false)                    // default
    }
  })

  // Test 2: Init with projectType cli creates config with cliConfig
  it('init with projectType cli creates config.yml with cliConfig defaults', async () => {
    const output = createMockOutput()
    const result = await runWizard({
      projectRoot: tmpDir,
      projectType: 'cli',
      cliInteractivity: 'hybrid',
      methodology: 'deep',
      force: false,
      auto: true,
      output,
    })

    expect(result.success).toBe(true)

    const { config } = loadConfig(tmpDir, [])
    expect(config).not.toBeNull()
    expect(config!.project?.projectType).toBe('cli')
    expect(config!.project?.cliConfig).toBeDefined()
    expect(config!.project?.cliConfig?.interactivity).toBe('hybrid')
  })

  // Test 3: config.yml round-trips through YAML correctly
  it('config.yml round-trips projectType and cliConfig through YAML', async () => {
    const output = createMockOutput()
    await runWizard({
      projectRoot: tmpDir,
      projectType: 'cli',
      cliInteractivity: 'args-only',
      methodology: 'deep',
      force: false,
      auto: true,
      output,
    })

    const configPath = path.join(tmpDir, '.scaffold', 'config.yml')
    const raw = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
    const project = raw['project'] as Record<string, unknown>
    expect(project['projectType']).toBe('cli')
    expect(project['cliConfig']).toBeDefined()
    const cc = project['cliConfig'] as Record<string, unknown>
    expect(cc['interactivity']).toBe('args-only')
  })

  // Test 4: Overlay loads successfully from content/methodology
  it('cli overlay loads without errors', () => {
    const methodologyDir = getPackageMethodologyDir()
    const overlayPath = path.join(methodologyDir, 'cli-overlay.yml')
    const { overlay, errors } = loadOverlay(overlayPath)
    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.projectType).toBe('cli')
    expect(Object.keys(overlay!.knowledgeOverrides).length).toBeGreaterThan(0)
  })

  // Test 5: Overlay injects cli knowledge into architecture step
  it('overlay injects cli-architecture into system-architecture step', async () => {
    const { overlayState } = await resolveProjectOverlay('cli')

    expect(overlayState.knowledge['system-architecture']).toBeDefined()
    expect(overlayState.knowledge['system-architecture']).toContain('cli-architecture')
    expect(overlayState.knowledge['system-architecture']).toContain('cli-interactivity-patterns')
  })

  // Test 6: Overlay injects knowledge into tech-stack step
  it('overlay injects cli knowledge into tech-stack step', async () => {
    const { overlayState } = await resolveProjectOverlay('cli')

    expect(overlayState.knowledge['tech-stack']).toBeDefined()
    expect(overlayState.knowledge['tech-stack']).toContain('cli-architecture')
    expect(overlayState.knowledge['tech-stack']).toContain('cli-distribution-patterns')
  })

  // Test 7: Overlay injects knowledge into testing steps
  it('overlay injects cli-testing into TDD and e2e steps', async () => {
    const { overlayState } = await resolveProjectOverlay('cli')

    expect(overlayState.knowledge['tdd']).toBeDefined()
    expect(overlayState.knowledge['tdd']).toContain('cli-testing')

    expect(overlayState.knowledge['add-e2e-testing']).toBeDefined()
    expect(overlayState.knowledge['add-e2e-testing']).toContain('cli-testing')
  })

  // Test 8: Overlay injects knowledge into foundational steps
  it('overlay injects cli knowledge into foundational steps', async () => {
    const { overlayState } = await resolveProjectOverlay('cli')

    expect(overlayState.knowledge['create-prd']).toContain('cli-requirements')
    expect(overlayState.knowledge['coding-standards']).toContain('cli-conventions')
    expect(overlayState.knowledge['project-structure']).toContain('cli-project-structure')
  })

  // Test 9: Overlay injects knowledge into operations step
  it('overlay injects cli knowledge into operations step', async () => {
    const { overlayState } = await resolveProjectOverlay('cli')

    expect(overlayState.knowledge['operations']).toBeDefined()
    expect(overlayState.knowledge['operations']).toContain('cli-distribution-patterns')
    expect(overlayState.knowledge['operations']).toContain('cli-shell-integration')
  })

  // Test 10: MVP methodology with cli overlay works
  it('MVP methodology with cli overlay injects knowledge', async () => {
    const { overlayState } = await resolveProjectOverlay('cli', 'mvp')

    expect(overlayState.knowledge['system-architecture']).toContain('cli-architecture')
    expect(overlayState.knowledge['tech-stack']).toContain('cli-distribution-patterns')
  })
})

// ---------------------------------------------------------------------------
// Cross-type validation tests
// ---------------------------------------------------------------------------

describe('project-type overlay cross-validation', () => {
  it('each overlay type injects distinct knowledge entries (no accidental overlap)', async () => {
    const [webResult, backendResult, cliResult] = await Promise.all([
      resolveProjectOverlay('web-app'),
      resolveProjectOverlay('backend'),
      resolveProjectOverlay('cli'),
    ])

    // system-architecture should have type-specific entries for each
    const webArch = webResult.overlayState.knowledge['system-architecture'] ?? []
    const backendArch = backendResult.overlayState.knowledge['system-architecture'] ?? []
    const cliArch = cliResult.overlayState.knowledge['system-architecture'] ?? []

    expect(webArch).toContain('web-app-architecture')
    expect(webArch).not.toContain('backend-architecture')
    expect(webArch).not.toContain('cli-architecture')

    expect(backendArch).toContain('backend-architecture')
    expect(backendArch).not.toContain('web-app-architecture')
    expect(backendArch).not.toContain('cli-architecture')

    expect(cliArch).toContain('cli-architecture')
    expect(cliArch).not.toContain('web-app-architecture')
    expect(cliArch).not.toContain('backend-architecture')
  })

  it('config schema rejects cross-typed config blocks', () => {
    // gameConfig on web-app
    expect(ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: { projectType: 'web-app', gameConfig: { engine: 'unity' } },
    }).success).toBe(false)

    // webAppConfig on backend
    expect(ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: { projectType: 'backend', webAppConfig: { renderingStrategy: 'spa' } },
    }).success).toBe(false)

    // backendConfig on cli
    expect(ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: { projectType: 'cli', backendConfig: { apiStyle: 'rest' } },
    }).success).toBe(false)

    // cliConfig on game
    expect(ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: { projectType: 'game', cliConfig: { interactivity: 'hybrid' } },
    }).success).toBe(false)
  })
})
