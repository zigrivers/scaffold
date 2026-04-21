/**
 * E2E integration tests for service-qualified execution (wave 3b).
 *
 * Verifies:
 *  - resolvePipeline with serviceId applies the per-service overlay
 *  - guardSteplessCommand rejects --service when no services[] in config
 *  - guardStepCommand rejects --service on a global step
 *  - guardStepCommand requires --service on a per-service step
 *  - globalSteps set is populated with overlay step-override keys
 *
 * Follows the same pattern as multi-service-pipeline.test.ts: hoisted vi.mock
 * calls, vi.importActual for real meta-prompts, loadAllPresets for preset steps.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

import { loadAllPresets } from '../core/assembly/preset-loader.js'
import { resolvePipeline } from '../core/pipeline/resolver.js'
import { guardStepCommand, guardSteplessCommand } from '../cli/guards.js'
import { getPackagePipelineDir, getPackageMethodologyDir } from '../utils/fs.js'
import type { MetaPromptFile } from '../types/index.js'
import type { ScaffoldConfig } from '../types/index.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockOutput() {
  return {
    success: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    result: vi.fn(),
    supportsInteractivePrompts: vi.fn().mockReturnValue(false),
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

/** Multi-service config with api=backend and web=web-app. */
function makeMultiServiceConfig(): ScaffoldConfig {
  return {
    version: 2,
    methodology: 'deep',
    platforms: ['claude-code'],
    project: {
      services: [
        {
          name: 'api',
          projectType: 'backend',
          backendConfig: {
            apiStyle: 'rest',
            dataStore: ['relational'],
            authMechanism: 'jwt',
            asyncMessaging: 'none',
            deployTarget: 'container',
            domain: 'none',
          },
        },
        {
          name: 'web',
          projectType: 'web-app',
          webAppConfig: {
            deployTarget: 'container',
            renderingStrategy: 'spa',
            realtime: 'none',
            authFlow: 'none',
          },
        },
      ],
    },
  } as unknown as ScaffoldConfig
}

/** Single-service config with no services[]. */
function makeSingleServiceConfig(): ScaffoldConfig {
  return {
    version: 2,
    methodology: 'deep',
    platforms: ['claude-code'],
    project: {
      projectType: 'backend',
      backendConfig: {
        apiStyle: 'rest',
        dataStore: ['relational'],
        authMechanism: 'jwt',
        asyncMessaging: 'none',
        deployTarget: 'container',
        domain: 'none',
      },
    },
  } as unknown as ScaffoldConfig
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('service-qualified execution E2E', () => {
  beforeEach(() => {
    process.exitCode = 0
  })

  afterEach(() => {
    process.exitCode = undefined
    vi.restoreAllMocks()
  })

  // Test 1: --service enables per-service overlay resolution
  it('--service enables per-service overlay resolution for backend service', async () => {
    const methodologyDir = getPackageMethodologyDir()
    const realMetaPrompts = await discoverRealMetaPrompts()
    const knownSteps = [...realMetaPrompts.keys()]
    const presets = loadAllPresets(methodologyDir, knownSteps)
    const output = createMockOutput()

    const config = makeMultiServiceConfig()

    // Resolve pipeline with serviceId='api' (backend type)
    const pipeline = resolvePipeline(
      {
        projectRoot: '/tmp/test',
        metaPrompts: realMetaPrompts,
        config,
        configErrors: [],
        configWarnings: [],
        presets,
        methodologyDir,
      },
      { output, serviceId: 'api' },
    )

    // The backend overlay injects backend-specific knowledge into tech-stack.
    // This proves the backend overlay was applied when serviceId='api' resolved
    // to backend projectType.
    const techStackKnowledge = pipeline.overlay.knowledge['tech-stack'] ?? []
    expect(
      techStackKnowledge.some(k => k.startsWith('backend-')),
      'tech-stack should have backend knowledge when serviceId=api',
    ).toBe(true)
  })

  // Test 2: --service flag rejected when no services[]
  it('--service flag rejected when config has no services[]', () => {
    const config = makeSingleServiceConfig()
    const output = createMockOutput()
    const ctx = { commandName: 'next', output }

    guardSteplessCommand(config, 'api', ctx)

    expect(process.exitCode).toBe(2)
    expect(output.error).toHaveBeenCalledOnce()
  })

  // Test 3: global step rejects --service
  it('global step rejects --service flag', () => {
    const config = makeMultiServiceConfig()
    const output = createMockOutput()
    const ctx = { commandName: 'run', output }

    // 'service-ownership-map' is defined in multi-service-overlay.yml step-overrides
    // and is therefore a global step — it must NOT accept --service
    const globalSteps = new Set(['service-ownership-map', 'create-vision', 'review-vision', 'create-prd', 'review-prd'])

    guardStepCommand('service-ownership-map', config, 'api', globalSteps, ctx)

    expect(process.exitCode).toBe(2)
    expect(output.error).toHaveBeenCalledOnce()
  })

  // Test 4: per-service step requires --service
  it('per-service step requires --service flag in multi-service config', () => {
    const config = makeMultiServiceConfig()
    const output = createMockOutput()
    const ctx = { commandName: 'run', output }

    // 'tech-stack' is NOT in globalSteps — it is a per-service step
    const globalSteps = new Set(['service-ownership-map', 'create-vision', 'review-vision', 'create-prd', 'review-prd'])

    guardStepCommand('tech-stack', config, undefined, globalSteps, ctx)

    expect(process.exitCode).toBe(2)
    expect(output.error).toHaveBeenCalledOnce()
  })

  // Test 5: globalSteps set contains overlay step-override keys
  it('globalSteps set is populated with multi-service overlay step-override keys', async () => {
    const methodologyDir = getPackageMethodologyDir()
    const realMetaPrompts = await discoverRealMetaPrompts()
    const knownSteps = [...realMetaPrompts.keys()]
    const presets = loadAllPresets(methodologyDir, knownSteps)
    const output = createMockOutput()

    const config = makeMultiServiceConfig()

    const pipeline = resolvePipeline(
      {
        projectRoot: '/tmp/test',
        metaPrompts: realMetaPrompts,
        config,
        configErrors: [],
        configWarnings: [],
        presets,
        methodologyDir,
      },
      { output },
    )

    // These keys are defined in multi-service-overlay.yml step-overrides
    const expectedGlobalSteps = [
      'service-ownership-map',
      'create-vision',
      'review-vision',
      'create-prd',
      'review-prd',
    ]

    for (const step of expectedGlobalSteps) {
      expect(pipeline.globalSteps.has(step), `globalSteps should contain '${step}'`).toBe(true)
    }
  })

  // Test: service-mode multi-domain resolves both sub-overlays in declaration order
  it('service-mode multi-domain: research service with [quant-finance, ml-research]', async () => {
    const methodologyDir = getPackageMethodologyDir()
    const realMetaPrompts = await discoverRealMetaPrompts()
    const knownSteps = [...realMetaPrompts.keys()]
    const presets = loadAllPresets(methodologyDir, knownSteps)
    const output = createMockOutput()

    // Research service with multi-domain array. Cast bypasses the schema-at-test-
    // construction check; the schema accepts this shape at actual load time (§5.3.1).
    const config = {
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        services: [
          {
            name: 'experiments',
            projectType: 'research',
            researchConfig: {
              experimentDriver: 'code-driven',
              interactionMode: 'checkpoint-gated',
              hasExperimentTracking: true,
              domain: ['quant-finance', 'ml-research'],
            },
          },
        ],
      },
    } as unknown as ScaffoldConfig

    const pipeline = resolvePipeline(
      {
        projectRoot: '/tmp/test',
        metaPrompts: realMetaPrompts,
        config,
        configErrors: [],
        configWarnings: [],
        presets,
        methodologyDir,
      },
      { output, serviceId: 'experiments' },
    )

    const sysArchKnowledge = pipeline.overlay.knowledge['system-architecture'] ?? []
    // Both overlays contributed — declaration order means quant-finance entries
    // appear before ml-research entries.
    const quantIdx = sysArchKnowledge.indexOf('research-quant-backtesting')
    const mlIdx = sysArchKnowledge.indexOf('research-ml-architecture-search')
    expect(quantIdx).toBeGreaterThan(-1)
    expect(mlIdx).toBeGreaterThan(-1)
    expect(quantIdx).toBeLessThan(mlIdx)
  })

  // Test: service-mode multi-domain reversed order still respects declaration order
  it('service-mode multi-domain: reversed order produces reversed positions', async () => {
    const methodologyDir = getPackageMethodologyDir()
    const realMetaPrompts = await discoverRealMetaPrompts()
    const knownSteps = [...realMetaPrompts.keys()]
    const presets = loadAllPresets(methodologyDir, knownSteps)
    const output = createMockOutput()

    const config = {
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        services: [
          {
            name: 'experiments',
            projectType: 'research',
            researchConfig: {
              experimentDriver: 'code-driven',
              interactionMode: 'checkpoint-gated',
              hasExperimentTracking: true,
              domain: ['ml-research', 'quant-finance'],
            },
          },
        ],
      },
    } as unknown as ScaffoldConfig

    const pipeline = resolvePipeline(
      {
        projectRoot: '/tmp/test',
        metaPrompts: realMetaPrompts,
        config,
        configErrors: [],
        configWarnings: [],
        presets,
        methodologyDir,
      },
      { output, serviceId: 'experiments' },
    )

    const sysArchKnowledge = pipeline.overlay.knowledge['system-architecture'] ?? []
    const quantIdx = sysArchKnowledge.indexOf('research-quant-backtesting')
    const mlIdx = sysArchKnowledge.indexOf('research-ml-architecture-search')
    expect(quantIdx).toBeGreaterThan(-1)
    expect(mlIdx).toBeGreaterThan(-1)
    // Reversed: ml-research entries appear BEFORE quant-finance entries
    expect(mlIdx).toBeLessThan(quantIdx)
  })
})
