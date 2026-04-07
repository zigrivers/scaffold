/**
 * E2E integration tests for project-type overlay flow:
 *   init → config.yml → overlay resolution → knowledge injection
 *
 * Tests the full pipeline for web-app, backend, cli, library, mobile-app,
 * data-pipeline, ml, and browser-extension project types:
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
  projectType: 'web-app' | 'backend' | 'cli' | 'library' | 'mobile-app'
    | 'data-pipeline' | 'ml' | 'browser-extension',
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
      webAppFlags: { webRendering: 'ssr' },
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
      webAppFlags: { webRendering: 'spa' },
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
      backendFlags: { backendApiStyle: 'rest' },
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
      backendFlags: { backendApiStyle: 'graphql' },
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
      cliFlags: { cliInteractivity: 'hybrid' },
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
      cliFlags: { cliInteractivity: 'args-only' },
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
// Tests — Library
// ---------------------------------------------------------------------------

describe('library overlay integration', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTempDir()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  // Test 1: Config with library + libraryConfig validates through ConfigSchema
  it('library config with libraryConfig validates through ConfigSchema', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        projectType: 'library',
        libraryConfig: { visibility: 'public' },
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      const project = result.data.project as Record<string, unknown>
      expect(project['projectType']).toBe('library')
      const lc = project['libraryConfig'] as Record<string, unknown>
      expect(lc['visibility']).toBe('public')
      expect(lc['runtimeTarget']).toBe('isomorphic')   // default
      expect(lc['bundleFormat']).toBe('dual')           // default
      expect(lc['hasTypeDefinitions']).toBe(true)       // default
      expect(lc['documentationLevel']).toBe('readme')   // default
    }
  })

  // Test 2: Init with projectType library creates config with libraryConfig
  it('init with projectType library creates config.yml with libraryConfig defaults', async () => {
    const output = createMockOutput()
    const result = await runWizard({
      projectRoot: tmpDir,
      projectType: 'library',
      libraryFlags: { libVisibility: 'public' },
      methodology: 'deep',
      force: false,
      auto: true,
      output,
    })

    expect(result.success).toBe(true)

    const { config } = loadConfig(tmpDir, [])
    expect(config).not.toBeNull()
    expect(config!.project?.projectType).toBe('library')
    expect(config!.project?.libraryConfig).toBeDefined()
    expect(config!.project?.libraryConfig?.visibility).toBe('public')
  })

  // Test 3: config.yml round-trips through YAML correctly
  it('config.yml round-trips projectType and libraryConfig through YAML', async () => {
    const output = createMockOutput()
    await runWizard({
      projectRoot: tmpDir,
      projectType: 'library',
      libraryFlags: { libVisibility: 'internal' },
      methodology: 'deep',
      force: false,
      auto: true,
      output,
    })

    const configPath = path.join(tmpDir, '.scaffold', 'config.yml')
    const raw = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
    const project = raw['project'] as Record<string, unknown>
    expect(project['projectType']).toBe('library')
    expect(project['libraryConfig']).toBeDefined()
    const lc = project['libraryConfig'] as Record<string, unknown>
    expect(lc['visibility']).toBe('internal')
  })

  // Test 4: Overlay loads successfully from content/methodology
  it('library overlay loads without errors', () => {
    const methodologyDir = getPackageMethodologyDir()
    const overlayPath = path.join(methodologyDir, 'library-overlay.yml')
    const { overlay, errors } = loadOverlay(overlayPath)
    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.projectType).toBe('library')
    expect(Object.keys(overlay!.knowledgeOverrides).length).toBeGreaterThan(0)
  })

  // Test 5: Overlay injects library knowledge into architecture step
  it('overlay injects library-architecture into system-architecture step', async () => {
    const { overlayState } = await resolveProjectOverlay('library')

    expect(overlayState.knowledge['system-architecture']).toBeDefined()
    expect(overlayState.knowledge['system-architecture']).toContain('library-architecture')
  })

  // Test 6: Overlay injects knowledge into tech-stack step
  it('overlay injects library knowledge into tech-stack step', async () => {
    const { overlayState } = await resolveProjectOverlay('library')

    expect(overlayState.knowledge['tech-stack']).toBeDefined()
    expect(overlayState.knowledge['tech-stack']).toContain('library-architecture')
    expect(overlayState.knowledge['tech-stack']).toContain('library-bundling')
    expect(overlayState.knowledge['tech-stack']).toContain('library-type-definitions')
  })

  // Test 7: Overlay injects knowledge into testing steps
  it('overlay injects library-testing into TDD and e2e steps', async () => {
    const { overlayState } = await resolveProjectOverlay('library')

    expect(overlayState.knowledge['tdd']).toBeDefined()
    expect(overlayState.knowledge['tdd']).toContain('library-testing')

    expect(overlayState.knowledge['add-e2e-testing']).toBeDefined()
    expect(overlayState.knowledge['add-e2e-testing']).toContain('library-testing')
  })

  // Test 8: Overlay injects knowledge into foundational steps
  it('overlay injects library knowledge into foundational steps', async () => {
    const { overlayState } = await resolveProjectOverlay('library')

    expect(overlayState.knowledge['create-prd']).toContain('library-requirements')
    expect(overlayState.knowledge['coding-standards']).toContain('library-conventions')
    expect(overlayState.knowledge['project-structure']).toContain('library-project-structure')
  })

  // Test 9: Overlay injects knowledge into api-contracts and operations steps
  it('overlay injects library knowledge into api-contracts and operations steps', async () => {
    const { overlayState } = await resolveProjectOverlay('library')

    expect(overlayState.knowledge['api-contracts']).toBeDefined()
    expect(overlayState.knowledge['api-contracts']).toContain('library-api-design')

    expect(overlayState.knowledge['operations']).toBeDefined()
    expect(overlayState.knowledge['operations']).toContain('library-versioning')
    expect(overlayState.knowledge['operations']).toContain('library-documentation')
  })

  // Test 10: MVP methodology with library overlay works
  it('MVP methodology with library overlay injects knowledge', async () => {
    const { overlayState } = await resolveProjectOverlay('library', 'mvp')

    expect(overlayState.knowledge['system-architecture']).toContain('library-architecture')
    expect(overlayState.knowledge['tech-stack']).toContain('library-bundling')
  })
})

// ---------------------------------------------------------------------------
// Tests — Mobile-app
// ---------------------------------------------------------------------------

describe('mobile-app overlay integration', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTempDir()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  // Test 1: Config with mobile-app + mobileAppConfig validates through ConfigSchema
  it('mobile-app config with mobileAppConfig validates through ConfigSchema', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        projectType: 'mobile-app',
        mobileAppConfig: { platform: 'cross-platform' },
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      const project = result.data.project as Record<string, unknown>
      expect(project['projectType']).toBe('mobile-app')
      const mc = project['mobileAppConfig'] as Record<string, unknown>
      expect(mc['platform']).toBe('cross-platform')
      expect(mc['distributionModel']).toBe('public')   // default
      expect(mc['offlineSupport']).toBe('none')        // default
      expect(mc['hasPushNotifications']).toBe(false)   // default
    }
  })

  // Test 2: Init with projectType mobile-app creates config with mobileAppConfig
  it('init with projectType mobile-app creates config.yml with mobileAppConfig defaults', async () => {
    const output = createMockOutput()
    const result = await runWizard({
      projectRoot: tmpDir,
      projectType: 'mobile-app',
      mobileAppFlags: { mobilePlatform: 'cross-platform' },
      methodology: 'deep',
      force: false,
      auto: true,
      output,
    })

    expect(result.success).toBe(true)

    const { config } = loadConfig(tmpDir, [])
    expect(config).not.toBeNull()
    expect(config!.project?.projectType).toBe('mobile-app')
    expect(config!.project?.mobileAppConfig).toBeDefined()
    expect(config!.project?.mobileAppConfig?.platform).toBe('cross-platform')
  })

  // Test 3: config.yml round-trips through YAML correctly
  it('config.yml round-trips projectType and mobileAppConfig through YAML', async () => {
    const output = createMockOutput()
    await runWizard({
      projectRoot: tmpDir,
      projectType: 'mobile-app',
      mobileAppFlags: { mobilePlatform: 'ios' },
      methodology: 'deep',
      force: false,
      auto: true,
      output,
    })

    const configPath = path.join(tmpDir, '.scaffold', 'config.yml')
    const raw = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
    const project = raw['project'] as Record<string, unknown>
    expect(project['projectType']).toBe('mobile-app')
    expect(project['mobileAppConfig']).toBeDefined()
    const mc = project['mobileAppConfig'] as Record<string, unknown>
    expect(mc['platform']).toBe('ios')
  })

  // Test 4: Overlay loads successfully from content/methodology
  it('mobile-app overlay loads without errors', () => {
    const methodologyDir = getPackageMethodologyDir()
    const overlayPath = path.join(methodologyDir, 'mobile-app-overlay.yml')
    const { overlay, errors } = loadOverlay(overlayPath)
    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.projectType).toBe('mobile-app')
    expect(Object.keys(overlay!.knowledgeOverrides).length).toBeGreaterThan(0)
  })

  // Test 5: Overlay injects mobile-app knowledge into architecture step
  it('overlay injects mobile-app-architecture into system-architecture step', async () => {
    const { overlayState } = await resolveProjectOverlay('mobile-app')

    expect(overlayState.knowledge['system-architecture']).toBeDefined()
    expect(overlayState.knowledge['system-architecture']).toContain('mobile-app-architecture')
    expect(overlayState.knowledge['system-architecture']).toContain('mobile-app-offline-patterns')
    expect(overlayState.knowledge['system-architecture']).toContain('mobile-app-push-notifications')
  })

  // Test 6: Overlay injects knowledge into tech-stack step
  it('overlay injects mobile-app knowledge into tech-stack step', async () => {
    const { overlayState } = await resolveProjectOverlay('mobile-app')

    expect(overlayState.knowledge['tech-stack']).toBeDefined()
    expect(overlayState.knowledge['tech-stack']).toContain('mobile-app-architecture')
    expect(overlayState.knowledge['tech-stack']).toContain('mobile-app-deployment')
  })

  // Test 7: Overlay injects knowledge into testing steps
  it('overlay injects mobile-app-testing into TDD and e2e steps', async () => {
    const { overlayState } = await resolveProjectOverlay('mobile-app')

    expect(overlayState.knowledge['tdd']).toBeDefined()
    expect(overlayState.knowledge['tdd']).toContain('mobile-app-testing')

    expect(overlayState.knowledge['add-e2e-testing']).toBeDefined()
    expect(overlayState.knowledge['add-e2e-testing']).toContain('mobile-app-testing')
  })

  // Test 8: Overlay injects knowledge into foundational steps
  it('overlay injects mobile-app knowledge into foundational steps', async () => {
    const { overlayState } = await resolveProjectOverlay('mobile-app')

    expect(overlayState.knowledge['create-prd']).toContain('mobile-app-requirements')
    expect(overlayState.knowledge['coding-standards']).toContain('mobile-app-conventions')
    expect(overlayState.knowledge['project-structure']).toContain('mobile-app-project-structure')
  })

  // Test 9: Overlay injects knowledge into ux-spec and operations steps
  it('overlay injects mobile-app knowledge into ux-spec and operations steps', async () => {
    const { overlayState } = await resolveProjectOverlay('mobile-app')

    expect(overlayState.knowledge['ux-spec']).toBeDefined()
    expect(overlayState.knowledge['ux-spec']).toContain('mobile-app-architecture')

    expect(overlayState.knowledge['operations']).toBeDefined()
    expect(overlayState.knowledge['operations']).toContain('mobile-app-deployment')
    expect(overlayState.knowledge['operations']).toContain('mobile-app-distribution')
    expect(overlayState.knowledge['operations']).toContain('mobile-app-observability')
  })

  // Test 10: MVP methodology with mobile-app overlay works
  it('MVP methodology with mobile-app overlay injects knowledge', async () => {
    const { overlayState } = await resolveProjectOverlay('mobile-app', 'mvp')

    expect(overlayState.knowledge['system-architecture']).toContain('mobile-app-architecture')
    expect(overlayState.knowledge['tech-stack']).toContain('mobile-app-deployment')
  })
})

// ---------------------------------------------------------------------------
// Tests — Data-pipeline
// ---------------------------------------------------------------------------

describe('data-pipeline overlay integration', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTempDir()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  // Test 1: Config with data-pipeline + dataPipelineConfig validates through ConfigSchema
  it('data-pipeline config with dataPipelineConfig validates through ConfigSchema', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        projectType: 'data-pipeline',
        dataPipelineConfig: { processingModel: 'streaming' },
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      const project = result.data.project as Record<string, unknown>
      expect(project['projectType']).toBe('data-pipeline')
      const dpc = project['dataPipelineConfig'] as Record<string, unknown>
      expect(dpc['processingModel']).toBe('streaming')
      expect(dpc['orchestration']).toBe('none')              // default
      expect(dpc['dataQualityStrategy']).toBe('validation')  // default
      expect(dpc['schemaManagement']).toBe('none')           // default
      expect(dpc['hasDataCatalog']).toBe(false)              // default
    }
  })

  // Test 2: Init with projectType data-pipeline creates config with dataPipelineConfig
  it('init with projectType data-pipeline creates config.yml with dataPipelineConfig defaults', async () => {
    const output = createMockOutput()
    const result = await runWizard({
      projectRoot: tmpDir,
      projectType: 'data-pipeline',
      dataPipelineFlags: { pipelineProcessing: 'batch' },
      methodology: 'deep',
      force: false,
      auto: true,
      output,
    })

    expect(result.success).toBe(true)

    const { config } = loadConfig(tmpDir, [])
    expect(config).not.toBeNull()
    expect(config!.project?.projectType).toBe('data-pipeline')
    expect(config!.project?.dataPipelineConfig).toBeDefined()
    expect(config!.project?.dataPipelineConfig?.processingModel).toBe('batch')
  })

  // Test 3: config.yml round-trips through YAML correctly
  it('config.yml round-trips projectType and dataPipelineConfig through YAML', async () => {
    const output = createMockOutput()
    await runWizard({
      projectRoot: tmpDir,
      projectType: 'data-pipeline',
      dataPipelineFlags: { pipelineProcessing: 'streaming' },
      methodology: 'deep',
      force: false,
      auto: true,
      output,
    })

    const configPath = path.join(tmpDir, '.scaffold', 'config.yml')
    const raw = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
    const project = raw['project'] as Record<string, unknown>
    expect(project['projectType']).toBe('data-pipeline')
    expect(project['dataPipelineConfig']).toBeDefined()
    const dpc = project['dataPipelineConfig'] as Record<string, unknown>
    expect(dpc['processingModel']).toBe('streaming')
  })

  // Test 4: Overlay loads successfully from content/methodology
  it('data-pipeline overlay loads without errors', () => {
    const methodologyDir = getPackageMethodologyDir()
    const overlayPath = path.join(methodologyDir, 'data-pipeline-overlay.yml')
    const { overlay, errors } = loadOverlay(overlayPath)
    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.projectType).toBe('data-pipeline')
    expect(Object.keys(overlay!.knowledgeOverrides).length).toBeGreaterThan(0)
  })

  // Test 5: Overlay injects data-pipeline knowledge into architecture step
  it('overlay injects data-pipeline knowledge into system-architecture step', async () => {
    const { overlayState } = await resolveProjectOverlay('data-pipeline')

    expect(overlayState.knowledge['system-architecture']).toBeDefined()
    expect(overlayState.knowledge['system-architecture']).toContain('data-pipeline-architecture')
    expect(overlayState.knowledge['system-architecture']).toContain('data-pipeline-batch-patterns')
    expect(overlayState.knowledge['system-architecture']).toContain('data-pipeline-streaming-patterns')
  })

  // Test 6: Overlay injects knowledge into tech-stack step
  it('overlay injects data-pipeline knowledge into tech-stack step', async () => {
    const { overlayState } = await resolveProjectOverlay('data-pipeline')

    expect(overlayState.knowledge['tech-stack']).toBeDefined()
    expect(overlayState.knowledge['tech-stack']).toContain('data-pipeline-architecture')
  })

  // Test 7: Overlay injects knowledge into testing steps
  it('overlay injects data-pipeline knowledge into TDD, e2e, and create-evals steps', async () => {
    const { overlayState } = await resolveProjectOverlay('data-pipeline')

    expect(overlayState.knowledge['tdd']).toBeDefined()
    expect(overlayState.knowledge['tdd']).toContain('data-pipeline-testing')
    expect(overlayState.knowledge['tdd']).toContain('data-pipeline-quality')

    expect(overlayState.knowledge['add-e2e-testing']).toBeDefined()
    expect(overlayState.knowledge['add-e2e-testing']).toContain('data-pipeline-testing')

    expect(overlayState.knowledge['create-evals']).toBeDefined()
    expect(overlayState.knowledge['create-evals']).toContain('data-pipeline-testing')
    expect(overlayState.knowledge['create-evals']).toContain('data-pipeline-quality')
  })

  // Test 8: Overlay injects knowledge into foundational steps
  it('overlay injects data-pipeline knowledge into foundational steps', async () => {
    const { overlayState } = await resolveProjectOverlay('data-pipeline')

    expect(overlayState.knowledge['create-prd']).toContain('data-pipeline-requirements')
    expect(overlayState.knowledge['coding-standards']).toContain('data-pipeline-conventions')
    expect(overlayState.knowledge['project-structure']).toContain('data-pipeline-project-structure')
  })

  // Test 9: Overlay injects knowledge into domain-modeling, security, and operations steps
  it('overlay injects data-pipeline knowledge into domain-modeling, security, and operations', async () => {
    const { overlayState } = await resolveProjectOverlay('data-pipeline')

    expect(overlayState.knowledge['domain-modeling']).toBeDefined()
    expect(overlayState.knowledge['domain-modeling']).toContain('data-pipeline-schema-management')

    expect(overlayState.knowledge['security']).toBeDefined()
    expect(overlayState.knowledge['security']).toContain('data-pipeline-security')

    expect(overlayState.knowledge['operations']).toBeDefined()
    expect(overlayState.knowledge['operations']).toContain('data-pipeline-orchestration')
  })

  // Test 10: MVP methodology with data-pipeline overlay works
  it('MVP methodology with data-pipeline overlay injects knowledge', async () => {
    const { overlayState } = await resolveProjectOverlay('data-pipeline', 'mvp')

    expect(overlayState.knowledge['system-architecture']).toContain('data-pipeline-architecture')
    expect(overlayState.knowledge['tdd']).toContain('data-pipeline-testing')
  })
})

// ---------------------------------------------------------------------------
// Tests — ML
// ---------------------------------------------------------------------------

describe('ml overlay integration', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTempDir()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  // Test 1: Config with ml + mlConfig validates through ConfigSchema
  it('ml config with mlConfig validates through ConfigSchema', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        projectType: 'ml',
        mlConfig: { projectPhase: 'training' },
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      const project = result.data.project as Record<string, unknown>
      expect(project['projectType']).toBe('ml')
      const mc = project['mlConfig'] as Record<string, unknown>
      expect(mc['projectPhase']).toBe('training')
      expect(mc['modelType']).toBe('deep-learning')        // default
      expect(mc['servingPattern']).toBe('none')            // default
      expect(mc['hasExperimentTracking']).toBe(true)       // default
    }
  })

  // Test 2: Init with projectType ml creates config with mlConfig
  it('init with projectType ml creates config.yml with mlConfig defaults', async () => {
    const output = createMockOutput()
    const result = await runWizard({
      projectRoot: tmpDir,
      projectType: 'ml',
      mlFlags: { mlPhase: 'training' },
      methodology: 'deep',
      force: false,
      auto: true,
      output,
    })

    expect(result.success).toBe(true)

    const { config } = loadConfig(tmpDir, [])
    expect(config).not.toBeNull()
    expect(config!.project?.projectType).toBe('ml')
    expect(config!.project?.mlConfig).toBeDefined()
    expect(config!.project?.mlConfig?.projectPhase).toBe('training')
  })

  // Test 3: config.yml round-trips through YAML correctly
  it('config.yml round-trips projectType and mlConfig through YAML', async () => {
    const output = createMockOutput()
    await runWizard({
      projectRoot: tmpDir,
      projectType: 'ml',
      mlFlags: { mlPhase: 'inference', mlServing: 'realtime' },
      methodology: 'deep',
      force: false,
      auto: true,
      output,
    })

    const configPath = path.join(tmpDir, '.scaffold', 'config.yml')
    const raw = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
    const project = raw['project'] as Record<string, unknown>
    expect(project['projectType']).toBe('ml')
    expect(project['mlConfig']).toBeDefined()
    const mc = project['mlConfig'] as Record<string, unknown>
    expect(mc['projectPhase']).toBe('inference')
    expect(mc['servingPattern']).toBe('realtime')
  })

  // Test 4: Overlay loads successfully from content/methodology
  it('ml overlay loads without errors', () => {
    const methodologyDir = getPackageMethodologyDir()
    const overlayPath = path.join(methodologyDir, 'ml-overlay.yml')
    const { overlay, errors } = loadOverlay(overlayPath)
    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.projectType).toBe('ml')
    expect(Object.keys(overlay!.knowledgeOverrides).length).toBeGreaterThan(0)
  })

  // Test 5: Overlay injects ml knowledge into architecture step
  it('overlay injects ml knowledge into system-architecture step', async () => {
    const { overlayState } = await resolveProjectOverlay('ml')

    expect(overlayState.knowledge['system-architecture']).toBeDefined()
    expect(overlayState.knowledge['system-architecture']).toContain('ml-architecture')
    expect(overlayState.knowledge['system-architecture']).toContain('ml-training-patterns')
    expect(overlayState.knowledge['system-architecture']).toContain('ml-serving-patterns')
  })

  // Test 6: Overlay injects knowledge into tech-stack step
  it('overlay injects ml knowledge into tech-stack step', async () => {
    const { overlayState } = await resolveProjectOverlay('ml')

    expect(overlayState.knowledge['tech-stack']).toBeDefined()
    expect(overlayState.knowledge['tech-stack']).toContain('ml-architecture')
  })

  // Test 7: Overlay injects knowledge into testing steps
  it('overlay injects ml knowledge into TDD, e2e, and create-evals steps', async () => {
    const { overlayState } = await resolveProjectOverlay('ml')

    expect(overlayState.knowledge['tdd']).toBeDefined()
    expect(overlayState.knowledge['tdd']).toContain('ml-testing')

    expect(overlayState.knowledge['add-e2e-testing']).toBeDefined()
    expect(overlayState.knowledge['add-e2e-testing']).toContain('ml-testing')

    // model-evaluation routes to create-evals
    expect(overlayState.knowledge['create-evals']).toBeDefined()
    expect(overlayState.knowledge['create-evals']).toContain('ml-testing')
    expect(overlayState.knowledge['create-evals']).toContain('ml-model-evaluation')
  })

  // Test 8: Overlay injects knowledge into foundational steps
  it('overlay injects ml knowledge into foundational steps', async () => {
    const { overlayState } = await resolveProjectOverlay('ml')

    expect(overlayState.knowledge['create-prd']).toContain('ml-requirements')
    expect(overlayState.knowledge['coding-standards']).toContain('ml-conventions')
    expect(overlayState.knowledge['project-structure']).toContain('ml-project-structure')
  })

  // Test 9: Overlay injects knowledge into security and operations (experiment tracking + observability)
  it('overlay injects ml knowledge into security and operations steps', async () => {
    const { overlayState } = await resolveProjectOverlay('ml')

    expect(overlayState.knowledge['security']).toBeDefined()
    expect(overlayState.knowledge['security']).toContain('ml-security')

    expect(overlayState.knowledge['operations']).toBeDefined()
    expect(overlayState.knowledge['operations']).toContain('ml-experiment-tracking')
    expect(overlayState.knowledge['operations']).toContain('ml-observability')
  })

  // Test 10: MVP methodology with ml overlay works
  it('MVP methodology with ml overlay injects knowledge', async () => {
    const { overlayState } = await resolveProjectOverlay('ml', 'mvp')

    expect(overlayState.knowledge['system-architecture']).toContain('ml-architecture')
    expect(overlayState.knowledge['create-evals']).toContain('ml-model-evaluation')
  })
})

// ---------------------------------------------------------------------------
// Tests — Browser-extension
// ---------------------------------------------------------------------------

describe('browser-extension overlay integration', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTempDir()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  // Test 1: Config with browser-extension + browserExtensionConfig validates through ConfigSchema
  it('browser-extension config with browserExtensionConfig validates through ConfigSchema', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        projectType: 'browser-extension',
        browserExtensionConfig: { manifestVersion: '3' },
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      const project = result.data.project as Record<string, unknown>
      expect(project['projectType']).toBe('browser-extension')
      const bec = project['browserExtensionConfig'] as Record<string, unknown>
      expect(bec['manifestVersion']).toBe('3')
      expect(bec['uiSurfaces']).toEqual(['popup'])         // default
      expect(bec['hasContentScript']).toBe(false)          // default
      expect(bec['hasBackgroundWorker']).toBe(true)        // default
    }
  })

  // Test 2: Init with projectType browser-extension creates config (no required flag in auto mode)
  it('init with projectType browser-extension creates config.yml with browserExtensionConfig defaults', async () => {
    const output = createMockOutput()
    const result = await runWizard({
      projectRoot: tmpDir,
      projectType: 'browser-extension',
      methodology: 'deep',
      force: false,
      auto: true,
      output,
    })

    expect(result.success).toBe(true)

    const { config } = loadConfig(tmpDir, [])
    expect(config).not.toBeNull()
    expect(config!.project?.projectType).toBe('browser-extension')
    expect(config!.project?.browserExtensionConfig).toBeDefined()
    expect(config!.project?.browserExtensionConfig?.manifestVersion).toBe('3')
    expect(config!.project?.browserExtensionConfig?.hasBackgroundWorker).toBe(true)
  })

  // Test 3: config.yml round-trips through YAML correctly
  it('config.yml round-trips projectType and browserExtensionConfig through YAML', async () => {
    const output = createMockOutput()
    await runWizard({
      projectRoot: tmpDir,
      projectType: 'browser-extension',
      browserExtensionFlags: {
        extManifest: '3',
        extUiSurfaces: ['popup', 'sidepanel'],
        extContentScript: true,
      },
      methodology: 'deep',
      force: false,
      auto: true,
      output,
    })

    const configPath = path.join(tmpDir, '.scaffold', 'config.yml')
    const raw = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
    const project = raw['project'] as Record<string, unknown>
    expect(project['projectType']).toBe('browser-extension')
    expect(project['browserExtensionConfig']).toBeDefined()
    const bec = project['browserExtensionConfig'] as Record<string, unknown>
    expect(bec['manifestVersion']).toBe('3')
    expect(bec['uiSurfaces']).toEqual(['popup', 'sidepanel'])
    expect(bec['hasContentScript']).toBe(true)
  })

  // Test 4: Overlay loads successfully from content/methodology
  it('browser-extension overlay loads without errors', () => {
    const methodologyDir = getPackageMethodologyDir()
    const overlayPath = path.join(methodologyDir, 'browser-extension-overlay.yml')
    const { overlay, errors } = loadOverlay(overlayPath)
    expect(errors).toHaveLength(0)
    expect(overlay).not.toBeNull()
    expect(overlay!.projectType).toBe('browser-extension')
    expect(Object.keys(overlay!.knowledgeOverrides).length).toBeGreaterThan(0)
  })

  // Test 5: Overlay injects browser-extension knowledge into architecture step
  it('overlay injects browser-extension knowledge into system-architecture step', async () => {
    const { overlayState } = await resolveProjectOverlay('browser-extension')

    expect(overlayState.knowledge['system-architecture']).toBeDefined()
    expect(overlayState.knowledge['system-architecture']).toContain('browser-extension-architecture')
    expect(overlayState.knowledge['system-architecture']).toContain('browser-extension-service-workers')
  })

  // Test 6: Overlay injects knowledge into tech-stack step
  it('overlay injects browser-extension knowledge into tech-stack step', async () => {
    const { overlayState } = await resolveProjectOverlay('browser-extension')

    expect(overlayState.knowledge['tech-stack']).toBeDefined()
    expect(overlayState.knowledge['tech-stack']).toContain('browser-extension-architecture')
    expect(overlayState.knowledge['tech-stack']).toContain('browser-extension-manifest')
  })

  // Test 7: Overlay injects knowledge into testing steps
  it('overlay injects browser-extension knowledge into TDD and e2e steps (cross-browser)', async () => {
    const { overlayState } = await resolveProjectOverlay('browser-extension')

    expect(overlayState.knowledge['tdd']).toBeDefined()
    expect(overlayState.knowledge['tdd']).toContain('browser-extension-testing')
    expect(overlayState.knowledge['tdd']).toContain('browser-extension-cross-browser')

    expect(overlayState.knowledge['add-e2e-testing']).toBeDefined()
    expect(overlayState.knowledge['add-e2e-testing']).toContain('browser-extension-testing')
    expect(overlayState.knowledge['add-e2e-testing']).toContain('browser-extension-cross-browser')
  })

  // Test 8: Overlay injects knowledge into foundational steps (manifest in coding-standards)
  it('overlay injects browser-extension knowledge into foundational steps', async () => {
    const { overlayState } = await resolveProjectOverlay('browser-extension')

    expect(overlayState.knowledge['create-prd']).toContain('browser-extension-requirements')
    expect(overlayState.knowledge['coding-standards']).toContain('browser-extension-conventions')
    expect(overlayState.knowledge['coding-standards']).toContain('browser-extension-manifest')
    expect(overlayState.knowledge['project-structure']).toContain('browser-extension-project-structure')
  })

  // Test 9: Overlay injects knowledge into security, ux-spec, and operations steps
  it('overlay injects browser-extension knowledge into security, ux-spec, and operations', async () => {
    const { overlayState } = await resolveProjectOverlay('browser-extension')

    expect(overlayState.knowledge['security']).toBeDefined()
    expect(overlayState.knowledge['security']).toContain('browser-extension-security')
    expect(overlayState.knowledge['security']).toContain('browser-extension-content-scripts')

    expect(overlayState.knowledge['ux-spec']).toBeDefined()
    expect(overlayState.knowledge['ux-spec']).toContain('browser-extension-architecture')

    expect(overlayState.knowledge['operations']).toBeDefined()
    expect(overlayState.knowledge['operations']).toContain('browser-extension-store-submission')
  })

  // Test 10: MVP methodology with browser-extension overlay works
  it('MVP methodology with browser-extension overlay injects knowledge', async () => {
    const { overlayState } = await resolveProjectOverlay('browser-extension', 'mvp')

    expect(overlayState.knowledge['system-architecture']).toContain('browser-extension-architecture')
    expect(overlayState.knowledge['tdd']).toContain('browser-extension-cross-browser')
  })
})

// ---------------------------------------------------------------------------
// Cross-type validation tests
// ---------------------------------------------------------------------------

describe('project-type overlay cross-validation', () => {
  it('each overlay type injects distinct knowledge entries (no accidental overlap)', async () => {
    const [
      webResult, backendResult, cliResult, libraryResult, mobileResult,
      pipelineResult, mlResult, extResult,
    ] = await Promise.all([
      resolveProjectOverlay('web-app'),
      resolveProjectOverlay('backend'),
      resolveProjectOverlay('cli'),
      resolveProjectOverlay('library'),
      resolveProjectOverlay('mobile-app'),
      resolveProjectOverlay('data-pipeline'),
      resolveProjectOverlay('ml'),
      resolveProjectOverlay('browser-extension'),
    ])

    // system-architecture should have type-specific entries for each
    const allArch: Record<string, string[]> = {
      'web-app': webResult.overlayState.knowledge['system-architecture'] ?? [],
      'backend': backendResult.overlayState.knowledge['system-architecture'] ?? [],
      'cli': cliResult.overlayState.knowledge['system-architecture'] ?? [],
      'library': libraryResult.overlayState.knowledge['system-architecture'] ?? [],
      'mobile-app': mobileResult.overlayState.knowledge['system-architecture'] ?? [],
      'data-pipeline': pipelineResult.overlayState.knowledge['system-architecture'] ?? [],
      'ml': mlResult.overlayState.knowledge['system-architecture'] ?? [],
      'browser-extension': extResult.overlayState.knowledge['system-architecture'] ?? [],
    }

    // Each project type's architecture step contains its own -architecture entry
    // and none of the other 7 type-specific architecture entries.
    const allTypes = Object.keys(allArch)
    for (const type of allTypes) {
      const ownEntry = `${type}-architecture`
      expect(allArch[type], `${type} should contain ${ownEntry}`).toContain(ownEntry)
      for (const otherType of allTypes) {
        if (otherType === type) continue
        const otherEntry = `${otherType}-architecture`
        expect(
          allArch[type],
          `${type} system-architecture must not leak ${otherEntry}`,
        ).not.toContain(otherEntry)
      }
    }
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

    // libraryConfig on web-app
    expect(ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: { projectType: 'web-app', libraryConfig: { visibility: 'public' } },
    }).success).toBe(false)

    // mobileAppConfig on backend
    expect(ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: { projectType: 'backend', mobileAppConfig: { platform: 'ios' } },
    }).success).toBe(false)

    // libraryConfig on mobile-app
    expect(ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: { projectType: 'mobile-app', libraryConfig: { visibility: 'internal' } },
    }).success).toBe(false)

    // mobileAppConfig on library
    expect(ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: { projectType: 'library', mobileAppConfig: { platform: 'android' } },
    }).success).toBe(false)

    // dataPipelineConfig on backend
    expect(ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: { projectType: 'backend', dataPipelineConfig: { processingModel: 'streaming' } },
    }).success).toBe(false)

    // mlConfig on data-pipeline
    expect(ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: { projectType: 'data-pipeline', mlConfig: { projectPhase: 'training' } },
    }).success).toBe(false)

    // browserExtensionConfig on web-app
    expect(ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: { projectType: 'web-app', browserExtensionConfig: { manifestVersion: '3' } },
    }).success).toBe(false)

    // dataPipelineConfig on ml
    expect(ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: { projectType: 'ml', dataPipelineConfig: { processingModel: 'batch' } },
    }).success).toBe(false)
  })

  it('ml inference projects must specify a serving pattern', () => {
    // inference + none → invalid
    expect(ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: { projectType: 'ml', mlConfig: { projectPhase: 'inference', servingPattern: 'none' } },
    }).success).toBe(false)

    // inference + realtime → valid
    expect(ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: { projectType: 'ml', mlConfig: { projectPhase: 'inference', servingPattern: 'realtime' } },
    }).success).toBe(true)

    // training + serving pattern → invalid
    expect(ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: { projectType: 'ml', mlConfig: { projectPhase: 'training', servingPattern: 'realtime' } },
    }).success).toBe(false)
  })

  it('browser-extension must have at least one capability', () => {
    // No surfaces, no content script, no background worker → invalid
    expect(ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        projectType: 'browser-extension',
        browserExtensionConfig: {
          manifestVersion: '3',
          uiSurfaces: [],
          hasContentScript: false,
          hasBackgroundWorker: false,
        },
      },
    }).success).toBe(false)

    // Just a content script → valid
    expect(ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        projectType: 'browser-extension',
        browserExtensionConfig: {
          manifestVersion: '3',
          uiSurfaces: [],
          hasContentScript: true,
          hasBackgroundWorker: false,
        },
      },
    }).success).toBe(true)
  })
})
