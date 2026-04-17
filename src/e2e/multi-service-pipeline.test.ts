/**
 * E2E tests for multi-service pipeline — exercises resolveOverlayState with
 * a services[] config, verifies cross-service steps are enabled, knowledge
 * is injected, and reads/dependencies are wired correctly.
 *
 * Follows the same pattern as game-pipeline.test.ts: real meta-prompts via
 * vi.importActual, mocked detectProjectMode and discoverMetaPrompts.
 */

import { describe, it, expect, vi } from 'vitest'

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
import { resolveOverlayState } from '../core/assembly/overlay-state-resolver.js'
import { getPackagePipelineDir, getPackageMethodologyDir } from '../utils/fs.js'
import type { MetaPromptFile } from '../types/index.js'
import type { OverlayState } from '../core/assembly/overlay-state-resolver.js'

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
 * Resolve the multi-service overlay with a given methodology against the real pipeline.
 * Config includes a services[] array to activate the structural overlay pass.
 */
async function resolveMultiServiceOverlay(
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
      project: {
        services: [
          {
            name: 'api', projectType: 'backend',
            backendConfig: {
              apiStyle: 'rest', dataStore: ['relational'], authMechanism: 'jwt',
              asyncMessaging: 'none', deployTarget: 'container', domain: 'none',
            },
          },
          {
            name: 'web', projectType: 'web-app',
            webAppConfig: {
              deployTarget: 'container', renderingStrategy: 'spa',
              realtime: 'none', authFlow: 'none',
            },
          },
        ],
      },
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

describe('multi-service pipeline E2E', () => {
  // Test 1: All 5 cross-service steps enabled when services[] present
  it('enables cross-service steps when services[] present', async () => {
    const { overlayState } = await resolveMultiServiceOverlay()

    const crossServiceSteps = [
      'service-ownership-map',
      'inter-service-contracts',
      'cross-service-auth',
      'cross-service-observability',
      'integration-test-plan',
    ]

    for (const step of crossServiceSteps) {
      expect(overlayState.steps[step], `${step} should be defined`).toBeDefined()
      expect(overlayState.steps[step]!.enabled, `${step} should be enabled`).toBe(true)
    }
  })

  // Test 2: Cross-service steps stay disabled when no services[]
  it('does NOT enable cross-service steps when no services[]', async () => {
    const methodologyDir = getPackageMethodologyDir()
    const realMetaPrompts = await discoverRealMetaPrompts()
    const knownSteps = [...realMetaPrompts.keys()]
    const presets = loadAllPresets(methodologyDir, knownSteps)
    const output = createMockOutput()

    const overlayState = resolveOverlayState({
      config: {
        version: 2,
        methodology: 'deep',
        platforms: ['claude-code'],
        project: {
          projectType: 'backend',
          backendConfig: {
            apiStyle: 'rest', dataStore: ['relational'], authMechanism: 'jwt',
            asyncMessaging: 'none', deployTarget: 'container', domain: 'none',
          },
        },
      },
      methodologyDir,
      metaPrompts: realMetaPrompts,
      presetSteps: presets.deep?.steps ?? {},
      output,
    })

    const crossServiceSteps = [
      'service-ownership-map',
      'inter-service-contracts',
      'cross-service-auth',
      'cross-service-observability',
      'integration-test-plan',
    ]

    for (const step of crossServiceSteps) {
      const stepEntry = overlayState.steps[step]
      if (stepEntry !== undefined) {
        expect(stepEntry.enabled, `${step} should not be enabled without services[]`).toBe(false)
      }
      // If not present in steps at all, it defaults to disabled — also acceptable
    }
  })

  // Test 3: Multi-service knowledge injected into existing steps
  it('injects multi-service knowledge into existing steps', async () => {
    const { overlayState } = await resolveMultiServiceOverlay()

    expect(overlayState.knowledge['system-architecture']).toBeDefined()
    expect(overlayState.knowledge['system-architecture']).toContain('multi-service-architecture')
    expect(overlayState.knowledge['system-architecture']).toContain('multi-service-resilience')
  })

  // Test 4: Reads injected into downstream steps
  it('injects reads into downstream steps', async () => {
    const { overlayState } = await resolveMultiServiceOverlay()

    expect(overlayState.reads['implementation-plan']).toBeDefined()
    expect(overlayState.reads['implementation-plan']).toContain('service-ownership-map')
  })

  // Test 5: Dependencies injected into downstream steps
  it('injects dependencies into downstream steps', async () => {
    const { overlayState } = await resolveMultiServiceOverlay()

    expect(overlayState.dependencies['review-security']).toBeDefined()
    expect(overlayState.dependencies['review-security']).toContain('cross-service-auth')
  })
})
