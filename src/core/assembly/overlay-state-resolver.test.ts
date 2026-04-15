import { describe, it, expect, vi } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveOverlayState } from './overlay-state-resolver.js'
import type { ScaffoldConfig, StepEnablementEntry } from '../../types/index.js'
import type { MetaPromptFrontmatter } from '../../types/frontmatter.js'
import type { OutputContext } from '../../cli/output/context.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixtureDir = path.resolve(__dirname, '../../../tests/fixtures/methodology')

function makeConfig(overrides: Partial<ScaffoldConfig> = {}): ScaffoldConfig {
  return {
    version: 2,
    methodology: 'deep',
    platforms: ['claude-code'],
    ...overrides,
  }
}

function makeFrontmatter(overrides: Partial<MetaPromptFrontmatter> = {}): MetaPromptFrontmatter {
  return {
    name: 'test-step',
    description: 'A test step',
    phase: 'pre',
    order: 100,
    dependencies: [],
    outputs: [],
    conditional: null,
    knowledgeBase: [],
    reads: [],
    stateless: false,
    category: 'pipeline',
    ...overrides,
  }
}

function makeOutput(): OutputContext {
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

describe('resolveOverlayState', () => {
  it('returns preset steps unchanged when no projectType in config', () => {
    const config = makeConfig() // no project.projectType
    const presetSteps: Record<string, StepEnablementEntry> = {
      'create-prd': { enabled: true },
      'review-prd': { enabled: true },
    }
    const metaPrompts = new Map<string, { frontmatter: MetaPromptFrontmatter }>([
      ['create-prd', { frontmatter: makeFrontmatter({
        name: 'create-prd', knowledgeBase: ['kb-1'],
        reads: ['read-1'], dependencies: [],
      }) }],
      ['review-prd', { frontmatter: makeFrontmatter({
        name: 'review-prd', knowledgeBase: [],
        reads: [], dependencies: ['create-prd'],
      }) }],
    ])

    const result = resolveOverlayState({
      config,
      methodologyDir: fixtureDir,
      metaPrompts,
      presetSteps,
      output: makeOutput(),
    })

    expect(result.steps).toEqual(presetSteps)
    expect(result.knowledge['create-prd']).toEqual(['kb-1'])
    expect(result.reads['create-prd']).toEqual(['read-1'])
    expect(result.dependencies['review-prd']).toEqual(['create-prd'])
  })

  it('returns overlay-merged steps when projectType is game and overlay file exists', () => {
    const config = makeConfig({
      project: { projectType: 'game' },
    })
    const presetSteps: Record<string, StepEnablementEntry> = {
      'design-system': { enabled: true },
      'tech-stack': { enabled: true },
      'tdd': { enabled: true },
    }
    const metaPrompts = new Map<string, { frontmatter: MetaPromptFrontmatter }>([
      ['design-system', { frontmatter: makeFrontmatter({
        name: 'design-system', knowledgeBase: [],
        reads: [], dependencies: [],
      }) }],
      ['tech-stack', { frontmatter: makeFrontmatter({
        name: 'tech-stack', knowledgeBase: ['tech-stack-selection'],
        reads: [], dependencies: [],
      }) }],
      ['tdd', { frontmatter: makeFrontmatter({
        name: 'tdd', knowledgeBase: ['tdd-basics'],
        reads: [], dependencies: [],
      }) }],
    ])

    const result = resolveOverlayState({
      config,
      methodologyDir: fixtureDir,
      metaPrompts,
      presetSteps,
      output: makeOutput(),
    })

    // game-overlay.yml disables design-system and enables game-design-document + review-gdd
    expect(result.steps['design-system']).toEqual({ enabled: false })
    expect(result.steps['game-design-document']).toEqual({ enabled: true })
    expect(result.steps['review-gdd']).toEqual({ enabled: true })
    // tech-stack and tdd should remain enabled from preset
    expect(result.steps['tech-stack']).toEqual({ enabled: true })
    expect(result.steps['tdd']).toEqual({ enabled: true })
  })

  it('returns overlay-merged knowledge, reads, and dependencies', () => {
    const config = makeConfig({
      project: { projectType: 'game' },
    })
    const presetSteps: Record<string, StepEnablementEntry> = {
      'tech-stack': { enabled: true },
      'tdd': { enabled: true },
      'story-tests': { enabled: true },
      'implementation-plan': { enabled: true },
      'user-stories': { enabled: true },
      'platform-parity-review': { enabled: true },
    }
    const metaPrompts = new Map<string, { frontmatter: MetaPromptFrontmatter }>([
      ['tech-stack', { frontmatter: makeFrontmatter({
        name: 'tech-stack', knowledgeBase: ['tech-stack-selection'],
        reads: [], dependencies: [],
      }) }],
      ['tdd', { frontmatter: makeFrontmatter({
        name: 'tdd', knowledgeBase: ['tdd-basics'],
        reads: [], dependencies: [],
      }) }],
      ['story-tests', { frontmatter: makeFrontmatter({
        name: 'story-tests', knowledgeBase: [],
        reads: ['ux-spec', 'user-stories'], dependencies: [],
      }) }],
      ['implementation-plan', { frontmatter: makeFrontmatter({
        name: 'implementation-plan', knowledgeBase: [],
        reads: ['ux-spec'], dependencies: [],
      }) }],
      ['user-stories', { frontmatter: makeFrontmatter({
        name: 'user-stories', knowledgeBase: [],
        reads: [], dependencies: ['review-prd'],
      }) }],
      ['platform-parity-review', { frontmatter: makeFrontmatter({
        name: 'platform-parity-review', knowledgeBase: [],
        reads: [], dependencies: ['review-ux'],
      }) }],
    ])

    const result = resolveOverlayState({
      config,
      methodologyDir: fixtureDir,
      metaPrompts,
      presetSteps,
      output: makeOutput(),
    })

    // Knowledge: game-overlay appends game-engine-selection to tech-stack, game-testing-strategy to tdd
    expect(result.knowledge['tech-stack']).toEqual(['tech-stack-selection', 'game-engine-selection'])
    expect(result.knowledge['tdd']).toEqual(['tdd-basics', 'game-testing-strategy'])

    // Reads: game-overlay replaces ux-spec with game-ui-spec in story-tests and implementation-plan
    expect(result.reads['story-tests']).toEqual(['game-ui-spec', 'user-stories'])
    expect(result.reads['implementation-plan']).toContain('game-ui-spec')
    expect(result.reads['implementation-plan']).toContain('game-design-document')

    // Dependencies: game-overlay appends review-gdd to user-stories
    expect(result.dependencies['user-stories']).toContain('review-prd')
    expect(result.dependencies['user-stories']).toContain('review-gdd')
    // Dependencies: game-overlay replaces review-ux with review-game-ui in platform-parity-review
    expect(result.dependencies['platform-parity-review']).toContain('review-game-ui')
    expect(result.dependencies['platform-parity-review']).not.toContain('review-ux')
  })

  it('handles missing overlay file gracefully (no crash, returns preset defaults, no warnings)', () => {
    const config = makeConfig({
      project: { projectType: 'cli' }, // no cli-overlay.yml exists in fixtures
    })
    const presetSteps: Record<string, StepEnablementEntry> = {
      'create-prd': { enabled: true },
    }
    const metaPrompts = new Map<string, { frontmatter: MetaPromptFrontmatter }>([
      ['create-prd', { frontmatter: makeFrontmatter({
        name: 'create-prd', knowledgeBase: ['kb-1'],
        reads: [], dependencies: [],
      }) }],
    ])
    const output = makeOutput()

    const result = resolveOverlayState({
      config,
      methodologyDir: fixtureDir,
      metaPrompts,
      presetSteps,
      output,
    })

    // Should not crash, should return preset defaults
    expect(result.steps).toEqual(presetSteps)
    expect(result.knowledge['create-prd']).toEqual(['kb-1'])
    // No warnings should be emitted for missing overlay files (P1-2 fix)
    expect(output.warn).not.toHaveBeenCalled()
  })

  it('handles malformed overlay YAML gracefully (warns and returns preset defaults)', () => {
    // Use a custom methodology dir that contains the malformed overlay
    // We name the test projectType 'malformed' so it looks for malformed-overlay.yml
    const config = makeConfig({
      project: { projectType: 'malformed' as never },
    })
    const presetSteps: Record<string, StepEnablementEntry> = {
      'create-prd': { enabled: true },
    }
    const metaPrompts = new Map<string, { frontmatter: MetaPromptFrontmatter }>([
      ['create-prd', { frontmatter: makeFrontmatter({
        name: 'create-prd', knowledgeBase: ['kb-1'],
        reads: [], dependencies: [],
      }) }],
    ])
    const output = makeOutput()

    const result = resolveOverlayState({
      config,
      methodologyDir: fixtureDir,
      metaPrompts,
      presetSteps,
      output,
    })

    // Should not crash, should return preset defaults
    expect(result.steps).toEqual(presetSteps)
    expect(result.knowledge['create-prd']).toEqual(['kb-1'])
    // Should have warned about the parse error
    expect(output.warn).toHaveBeenCalled()
  })

  it('does not load sub-overlay when domain is none', () => {
    const config = makeConfig({
      project: {
        projectType: 'research',
        researchConfig: {
          experimentDriver: 'code-driven',
          interactionMode: 'checkpoint-gated',
          hasExperimentTracking: true,
          domain: 'none',
        },
      },
    })
    const presetSteps: Record<string, StepEnablementEntry> = {
      'tech-stack': { enabled: true },
      'tdd': { enabled: true },
    }
    const metaPrompts = new Map<string, { frontmatter: MetaPromptFrontmatter }>([
      ['tech-stack', { frontmatter: makeFrontmatter({
        name: 'tech-stack', knowledgeBase: ['tech-stack-selection'],
        reads: [], dependencies: [],
      }) }],
      ['tdd', { frontmatter: makeFrontmatter({
        name: 'tdd', knowledgeBase: ['tdd-basics'],
        reads: [], dependencies: [],
      }) }],
    ])

    const result = resolveOverlayState({
      config,
      methodologyDir: fixtureDir,
      metaPrompts,
      presetSteps,
      output: makeOutput(),
    })

    // research-overlay.yml appends research-tooling to tech-stack, but no sub-overlay
    expect(result.knowledge['tech-stack']).toEqual(['tech-stack-selection', 'research-tooling'])
    // tdd should NOT have quant-finance sub-overlay entries
    expect(result.knowledge['tdd']).toEqual(['tdd-basics'])
  })

  it('appends domain sub-overlay knowledge AFTER core overlay knowledge', () => {
    const config = makeConfig({
      project: {
        projectType: 'research',
        researchConfig: {
          experimentDriver: 'code-driven',
          interactionMode: 'checkpoint-gated',
          hasExperimentTracking: true,
          domain: 'quant-finance',
        },
      },
    })
    const presetSteps: Record<string, StepEnablementEntry> = {
      'tech-stack': { enabled: true },
      'tdd': { enabled: true },
    }
    const metaPrompts = new Map<string, { frontmatter: MetaPromptFrontmatter }>([
      ['tech-stack', { frontmatter: makeFrontmatter({
        name: 'tech-stack', knowledgeBase: ['tech-stack-selection'],
        reads: [], dependencies: [],
      }) }],
      ['tdd', { frontmatter: makeFrontmatter({
        name: 'tdd', knowledgeBase: ['tdd-basics'],
        reads: [], dependencies: [],
      }) }],
    ])

    const result = resolveOverlayState({
      config,
      methodologyDir: fixtureDir,
      metaPrompts,
      presetSteps,
      output: makeOutput(),
    })

    // Core overlay appends research-tooling, then sub-overlay appends quant-data-feeds
    expect(result.knowledge['tech-stack']).toEqual([
      'tech-stack-selection', 'research-tooling', 'quant-data-feeds',
    ])
    // Sub-overlay appends backtest-validation to tdd
    expect(result.knowledge['tdd']).toEqual([
      'tdd-basics', 'backtest-validation',
    ])
  })

  it('loads backend-fintech.yml when BackendConfig.domain is fintech', () => {
    const config = makeConfig({
      project: {
        projectType: 'backend',
        backendConfig: {
          apiStyle: 'rest',
          dataStore: ['relational'],
          authMechanism: 'jwt',
          asyncMessaging: 'none',
          deployTarget: 'container',
          domain: 'fintech',
        },
      },
    })
    const presetSteps: Record<string, StepEnablementEntry> = {
      'tech-stack': { enabled: true },
    }
    const metaPrompts = new Map<string, { frontmatter: MetaPromptFrontmatter }>([
      ['tech-stack', { frontmatter: makeFrontmatter({
        name: 'tech-stack', knowledgeBase: ['tech-stack-selection'],
        reads: [], dependencies: [],
      }) }],
    ])

    const result = resolveOverlayState({
      config,
      methodologyDir: fixtureDir,
      metaPrompts,
      presetSteps,
      output: makeOutput(),
    })

    // backend-fintech.yml appends fintech-compliance to tech-stack
    expect(result.knowledge['tech-stack']).toEqual([
      'tech-stack-selection', 'fintech-compliance',
    ])
  })

  it("does NOT load backend-fintech.yml when BackendConfig.domain is 'none'", () => {
    const config = makeConfig({
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
    })
    const presetSteps: Record<string, StepEnablementEntry> = {
      'tech-stack': { enabled: true },
    }
    const metaPrompts = new Map<string, { frontmatter: MetaPromptFrontmatter }>([
      ['tech-stack', { frontmatter: makeFrontmatter({
        name: 'tech-stack', knowledgeBase: ['tech-stack-selection'],
        reads: [], dependencies: [],
      }) }],
    ])

    const result = resolveOverlayState({
      config,
      methodologyDir: fixtureDir,
      metaPrompts,
      presetSteps,
      output: makeOutput(),
    })

    // Domain is 'none' — sub-overlay must not load
    expect(result.knowledge['tech-stack']).toEqual(['tech-stack-selection'])
    expect(result.knowledge['tech-stack']).not.toContain('fintech-compliance')
  })

  it('handles undefined config.project gracefully', () => {
    const config = makeConfig() // config.project is undefined
    const presetSteps: Record<string, StepEnablementEntry> = {
      'step-a': { enabled: true },
    }
    const metaPrompts = new Map<string, { frontmatter: MetaPromptFrontmatter }>([
      ['step-a', { frontmatter: makeFrontmatter({
        name: 'step-a', knowledgeBase: [],
        reads: ['step-b'], dependencies: ['step-c'],
      }) }],
    ])

    const result = resolveOverlayState({
      config,
      methodologyDir: fixtureDir,
      metaPrompts,
      presetSteps,
      output: makeOutput(),
    })

    expect(result.steps).toEqual(presetSteps)
    expect(result.knowledge['step-a']).toEqual([])
    expect(result.reads['step-a']).toEqual(['step-b'])
    expect(result.dependencies['step-a']).toEqual(['step-c'])
  })
})
