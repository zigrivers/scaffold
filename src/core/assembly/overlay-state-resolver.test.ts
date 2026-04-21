import { describe, it, expect, vi } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import os from 'node:os'
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

  it('does NOT load backend-fintech.yml when BackendConfig.domain is \'none\'', () => {
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

  it('resolves identically for domain: "fintech" and domain: ["fintech"] (array shape invariant)', () => {
    const backendConfigBase = {
      apiStyle: 'rest' as const,
      dataStore: ['relational' as const],
      authMechanism: 'jwt' as const,
      asyncMessaging: 'none' as const,
      deployTarget: 'container' as const,
    }
    const presetSteps: Record<string, StepEnablementEntry> = {
      'tech-stack': { enabled: true },
    }
    const metaPrompts = new Map<string, { frontmatter: MetaPromptFrontmatter }>([
      ['tech-stack', { frontmatter: makeFrontmatter({
        name: 'tech-stack', knowledgeBase: ['tech-stack-selection'],
        reads: [], dependencies: [],
      }) }],
    ])

    const stringResult = resolveOverlayState({
      config: makeConfig({
        project: {
          projectType: 'backend',
          backendConfig: { ...backendConfigBase, domain: 'fintech' },
        },
      }),
      methodologyDir: fixtureDir,
      metaPrompts,
      presetSteps,
      output: makeOutput(),
    })

    const arrayResult = resolveOverlayState({
      config: makeConfig({
        project: {
          projectType: 'backend',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          backendConfig: { ...backendConfigBase, domain: ['fintech'] as any },
        },
      }),
      methodologyDir: fixtureDir,
      metaPrompts,
      presetSteps,
      output: makeOutput(),
    })

    expect(stringResult.knowledge['tech-stack']).toEqual(arrayResult.knowledge['tech-stack'])
  })

  it('warns on duplicate domain entries with config-key context', () => {
    const backendConfigBase = {
      apiStyle: 'rest' as const,
      dataStore: ['relational' as const],
      authMechanism: 'jwt' as const,
      asyncMessaging: 'none' as const,
      deployTarget: 'container' as const,
    }
    const output = makeOutput()
    resolveOverlayState({
      config: makeConfig({
        project: {
          projectType: 'backend',
          // Cast bypasses schema for isolated resolver behavior test.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          backendConfig: { ...backendConfigBase, domain: ['fintech', 'fintech'] as any },
        },
      }),
      methodologyDir: fixtureDir,
      metaPrompts: new Map<string, { frontmatter: MetaPromptFrontmatter }>([
        ['tech-stack', { frontmatter: makeFrontmatter({
          name: 'tech-stack', knowledgeBase: ['tech-stack-selection'],
          reads: [], dependencies: [],
        }) }],
      ]),
      presetSteps: { 'tech-stack': { enabled: true } },
      output,
    })
    // Warning must include the config key for user-facing disambiguation.
    expect(output.warn).toHaveBeenCalledWith(
      expect.stringContaining('Duplicate domain(s) in backendConfig.domain'),
    )
    expect(output.warn).toHaveBeenCalledWith(expect.stringContaining('fintech'))
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

  describe('structural overlay (multi-service)', () => {
    it('activates structural overlay when services[] present', () => {
      const output = makeOutput()
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-structural-'))
      fs.writeFileSync(path.join(tmpDir, 'multi-service-overlay.yml'), `
name: multi-service
description: Test structural overlay

step-overrides:
  service-ownership-map: { enabled: true }

knowledge-overrides:
  system-architecture:
    append: [multi-service-architecture]
`, 'utf8')

      const presetSteps: Record<string, StepEnablementEntry> = {
        'create-vision': { enabled: true },
        'service-ownership-map': { enabled: false },
        'system-architecture': { enabled: true },
      }
      const metaPrompts = new Map([
        ['create-vision', { frontmatter: makeFrontmatter({ name: 'create-vision' }) }],
        ['service-ownership-map', { frontmatter: makeFrontmatter({ name: 'service-ownership-map' }) }],
        ['system-architecture', {
          frontmatter: makeFrontmatter({ name: 'system-architecture', knowledgeBase: ['system-architecture'] }),
        }],
      ])

      const result = resolveOverlayState({
        config: makeConfig({
          project: {
            services: [{
              name: 'api',
              projectType: 'backend',
              backendConfig: {
                apiStyle: 'rest', dataStore: ['relational'], authMechanism: 'jwt',
                asyncMessaging: 'none', deployTarget: 'container', domain: 'none',
              },
            }],
          },
        }),
        methodologyDir: tmpDir,
        metaPrompts,
        presetSteps,
        output,
      })

      expect(result.steps['service-ownership-map']?.enabled).toBe(true)
      expect(result.knowledge['system-architecture']).toContain('multi-service-architecture')
    })

    it('emits warning when structural overlay conflicts with project-type overlay', () => {
      const output = makeOutput()
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-conflict-'))
      fs.writeFileSync(path.join(tmpDir, 'multi-service-overlay.yml'), `
name: multi-service
description: Test conflict

step-overrides:
  design-system: { enabled: true }
`, 'utf8')

      const presetSteps: Record<string, StepEnablementEntry> = {
        'design-system': { enabled: false },
      }
      const metaPrompts = new Map([
        ['design-system', { frontmatter: makeFrontmatter({ name: 'design-system' }) }],
      ])

      resolveOverlayState({
        config: makeConfig({
          project: {
            services: [{
              name: 'api',
              projectType: 'backend',
              backendConfig: {
                apiStyle: 'rest', dataStore: ['relational'], authMechanism: 'jwt',
                asyncMessaging: 'none', deployTarget: 'container', domain: 'none',
              },
            }],
          },
        }),
        methodologyDir: tmpDir,
        metaPrompts,
        presetSteps,
        output,
      })

      expect(output.warn).toHaveBeenCalledWith(
        expect.stringContaining('design-system'),
      )
    })

    it('does NOT activate structural overlay when services[] absent', () => {
      const output = makeOutput()
      const presetSteps: Record<string, StepEnablementEntry> = {
        'service-ownership-map': { enabled: false },
      }
      const metaPrompts = new Map([
        ['service-ownership-map', { frontmatter: makeFrontmatter({ name: 'service-ownership-map' }) }],
      ])

      const result = resolveOverlayState({
        config: makeConfig(),
        methodologyDir: fixtureDir,
        metaPrompts,
        presetSteps,
        output,
      })

      expect(result.steps['service-ownership-map']?.enabled).toBe(false)
    })

    it('does NOT activate when services[] is empty array', () => {
      const output = makeOutput()
      const presetSteps: Record<string, StepEnablementEntry> = {
        'service-ownership-map': { enabled: false },
      }
      const metaPrompts = new Map([
        ['service-ownership-map', { frontmatter: makeFrontmatter({ name: 'service-ownership-map' }) }],
      ])

      const result = resolveOverlayState({
        config: makeConfig({ project: { services: [] } }),
        methodologyDir: fixtureDir,
        metaPrompts,
        presetSteps,
        output,
      })

      expect(result.steps['service-ownership-map']?.enabled).toBe(false)
    })

    it('warns when structural overlay targets unknown step', () => {
      const output = makeOutput()
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-test-'))
      fs.writeFileSync(path.join(tmpDir, 'multi-service-overlay.yml'), `
name: multi-service
description: Test overlay

step-overrides:
  nonexistent-step: { enabled: true }
`, 'utf8')

      const presetSteps: Record<string, StepEnablementEntry> = {}
      const metaPrompts = new Map<string, { frontmatter: MetaPromptFrontmatter }>()

      resolveOverlayState({
        config: makeConfig({
          project: {
            services: [{
              name: 'api',
              projectType: 'backend',
              backendConfig: {
                apiStyle: 'rest', dataStore: ['relational'], authMechanism: 'jwt',
                asyncMessaging: 'none', deployTarget: 'container', domain: 'none',
              },
            }],
          },
        }),
        methodologyDir: tmpDir,
        metaPrompts,
        presetSteps,
        output,
      })

      expect(output.warn).toHaveBeenCalledWith(
        expect.stringContaining('nonexistent-step'),
      )
    })
  })
})

describe('crossReads on OverlayState (Wave 3c)', () => {
  // With Wave 3c+1, resolveOverlayState populates OverlayState.crossReads from
  // frontmatter merged with any overlay cross-reads-overrides. Consumers should
  // read `overlay.crossReads?.[slug]` as authoritative.
  it('returns crossReads populated from frontmatter when no overlay overrides configured', () => {
    const metaPrompts = new Map<string, { frontmatter: MetaPromptFrontmatter }>([
      ['system-architecture', {
        frontmatter: makeFrontmatter({
          name: 'system-architecture',
          phase: 'architecture',
          order: 700,
          outputs: ['docs/architecture.md'],
          crossReads: [{ service: 'shared-lib', step: 'api-contracts' }],
        }),
      }],
    ])
    const result = resolveOverlayState({
      config: makeConfig(),
      methodologyDir: '/nonexistent',
      metaPrompts,
      presetSteps: {},
      output: makeOutput(),
    })
    expect(result.crossReads['system-architecture']).toEqual([
      { service: 'shared-lib', step: 'api-contracts' },
    ])
  })

  it('returns crossReads keyed per-step with empty arrays when no step has crossReads', () => {
    const metaPrompts = new Map<string, { frontmatter: MetaPromptFrontmatter }>([
      ['some-step', { frontmatter: makeFrontmatter({ name: 'some-step' }) }],
    ])
    const result = resolveOverlayState({
      config: makeConfig(), methodologyDir: '/nonexistent', metaPrompts, presetSteps: {}, output: makeOutput(),
    })
    expect(result.crossReads['some-step']).toEqual([])
  })

  it('threads crossReadsMap through BOTH project-type (pass 1) and structural (pass 2) passes', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cross-reads-both-'))
    try {
      // Pass-1 overlay (project-type: backend) — no cross-reads-overrides (forbidden per §4.1)
      fs.writeFileSync(path.join(tmpDir, 'backend-overlay.yml'), `
name: backend
description: pass-1 overlay
project-type: backend
step-overrides:
  system-architecture: { enabled: true }
`)
      // Pass-2 overlay (structural multi-service) — owns cross-reads-overrides
      fs.writeFileSync(path.join(tmpDir, 'multi-service-overlay.yml'), `
name: multi-service
description: pass-2 overlay
step-overrides:
  system-architecture: { enabled: true }
cross-reads-overrides:
  system-architecture:
    append:
      - service: billing
        step: api-contracts
`)
      const metaPrompts = new Map<string, { frontmatter: MetaPromptFrontmatter }>([
        ['system-architecture', {
          frontmatter: makeFrontmatter({
            name: 'system-architecture',
            phase: 'architecture', order: 700,
            outputs: ['docs/arch.md'],
            // Frontmatter entry MUST survive both passes. Pass 1 is a no-op for
            // cross-reads (§4.1), pass 2 appends. A bug that zeroes the map
            // before pass 2 would drop this entry.
            crossReads: [{ service: 'shared-lib', step: 'api-contracts' }],
          }),
        }],
      ])
      const result = resolveOverlayState({
        config: makeConfig({
          project: {
            projectType: 'backend',        // triggers pass 1
            services: [{                    // triggers pass 2
              name: 'api', projectType: 'backend',
              backendConfig: { apiStyle: 'rest' },
            }],
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
        methodologyDir: tmpDir,
        metaPrompts,
        presetSteps: {},
        output: makeOutput(),
      })
      // Frontmatter entry (preserved through pass 1) + overlay append from pass 2
      expect(result.crossReads['system-architecture']).toEqual([
        { service: 'shared-lib', step: 'api-contracts' },  // from frontmatter
        { service: 'billing', step: 'api-contracts' },      // from structural overlay
      ])
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
