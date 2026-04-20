// src/types/config.test.ts
import { describe, it, expect } from 'vitest'
import type {
  ProjectConfig, GameConfig, PipelineOverlay, KnowledgeOverride,
  ReadsOverride, DependencyOverride, StepEnablementEntry,
} from './config.js'

describe('GameConfig type', () => {
  it('accepts a valid game config', () => {
    const config: GameConfig = {
      engine: 'unity',
      multiplayerMode: 'none',
      narrative: 'none',
      contentStructure: 'discrete',
      economy: 'none',
      onlineServices: [],
      persistence: 'progression',
      targetPlatforms: ['pc'],
      supportedLocales: ['en'],
      hasModding: false,
      npcAiComplexity: 'none',
    }
    expect(config.engine).toBe('unity')
  })

  it('accepts a project without projectType (backwards compatible)', () => {
    const project: ProjectConfig = { name: 'my-web-app' }
    expect(project.projectType).toBeUndefined()
  })
})

describe('StepEnablementEntry type', () => {
  it('accepts enabled-only entry', () => {
    const entry: StepEnablementEntry = { enabled: true }
    expect(entry.enabled).toBe(true)
    expect(entry.conditional).toBeUndefined()
  })

  it('accepts entry with conditional', () => {
    const entry: StepEnablementEntry = { enabled: true, conditional: 'if-needed' }
    expect(entry.conditional).toBe('if-needed')
  })
})

describe('PipelineOverlay type', () => {
  it('accepts a valid overlay', () => {
    const overlay: PipelineOverlay = {
      name: 'game',
      description: 'Game development overlay',
      projectType: 'game',
      stepOverrides: {
        'game-design-document': { enabled: true },
        'design-system': { enabled: false },
      },
      knowledgeOverrides: {
        'tech-stack': { append: ['game-engine-selection'] },
      },
      readsOverrides: {
        'story-tests': { replace: { 'ux-spec': 'game-ui-spec' }, append: [] },
      },
      dependencyOverrides: {
        'user-stories': { replace: {}, append: ['review-gdd'] },
      },
      crossReadsOverrides: {},
    }
    expect(overlay.name).toBe('game')
    expect(overlay.projectType).toBe('game')
    expect(overlay.stepOverrides['game-design-document']?.enabled).toBe(true)
  })

  it('accepts a structural overlay without projectType', () => {
    const overlay: PipelineOverlay = {
      name: 'multi-service',
      description: 'Cross-service overlay',
      stepOverrides: { 'service-ownership-map': { enabled: true } },
      knowledgeOverrides: {},
      readsOverrides: {},
      dependencyOverrides: {},
      crossReadsOverrides: {},
    }
    expect(overlay.name).toBe('multi-service')
    expect(overlay.projectType).toBeUndefined()
  })
})

describe('KnowledgeOverride type', () => {
  it('accepts a valid knowledge override', () => {
    const override: KnowledgeOverride = { append: ['game-testing-strategy'] }
    expect(override.append).toHaveLength(1)
    expect(override.append[0]).toBe('game-testing-strategy')
  })
})

describe('ReadsOverride type', () => {
  it('accepts a reads override with replace and append', () => {
    const override: ReadsOverride = {
      replace: { 'ux-spec': 'game-ui-spec' },
      append: ['game-design-document'],
    }
    expect(override.replace?.['ux-spec']).toBe('game-ui-spec')
    expect(override.append).toHaveLength(1)
  })

  it('accepts a reads override with only append', () => {
    const override: ReadsOverride = { append: ['extra-doc'] }
    expect(override.replace).toBeUndefined()
    expect(override.append).toHaveLength(1)
  })
})

describe('DependencyOverride type', () => {
  it('accepts a dependency override with replace and append', () => {
    const override: DependencyOverride = {
      replace: { 'review-ux': 'review-game-ui' },
      append: ['review-gdd'],
    }
    expect(override.replace?.['review-ux']).toBe('review-game-ui')
    expect(override.append).toHaveLength(1)
  })

  it('accepts a dependency override with only replace', () => {
    const override: DependencyOverride = { replace: { 'a': 'b' } }
    expect(override.append).toBeUndefined()
  })
})

describe('CrossReadsOverride + PipelineOverlay.crossReadsOverrides (cross-reads overrides feature)', () => {
  it('PipelineOverlay literal with crossReadsOverrides compiles and round-trips', () => {
    const overlay: PipelineOverlay = {
      name: 'test',
      description: 'desc',
      stepOverrides: {},
      knowledgeOverrides: {},
      readsOverrides: {},
      dependencyOverrides: {},
      crossReadsOverrides: {
        'system-architecture': {
          append: [{ service: 'billing', step: 'api-contracts' }],
        },
      },
    }
    expect(overlay.crossReadsOverrides['system-architecture'].append).toHaveLength(1)
    expect(overlay.crossReadsOverrides['system-architecture'].append[0]).toEqual({
      service: 'billing',
      step: 'api-contracts',
    })
  })

  it('PipelineOverlay requires crossReadsOverrides (empty object allowed)', () => {
    const overlay: PipelineOverlay = {
      name: 'test',
      description: 'desc',
      stepOverrides: {},
      knowledgeOverrides: {},
      readsOverrides: {},
      dependencyOverrides: {},
      crossReadsOverrides: {},
    }
    expect(overlay.crossReadsOverrides).toEqual({})
  })
})
