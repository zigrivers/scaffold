// src/config/schema.test.ts

import { describe, it, expect } from 'vitest'
import yaml from 'js-yaml'
import {
  ConfigSchema, GameConfigSchema, ProjectTypeSchema,
  WebAppConfigSchema, BackendConfigSchema, CliConfigSchema,
  LibraryConfigSchema, MobileAppConfigSchema,
  DataPipelineConfigSchema, MlConfigSchema, BrowserExtensionConfigSchema,
  ResearchConfigSchema, ServiceSchema, ProjectSchema,
  backendRealDomains, researchRealDomains,
} from './schema.js'

describe('ProjectTypeSchema', () => {
  it('includes all project types', () => {
    expect(ProjectTypeSchema.options).toEqual(
      expect.arrayContaining([
        'web-app', 'mobile-app', 'backend', 'cli', 'library', 'game',
        'data-pipeline', 'ml', 'browser-extension', 'research',
      ]),
    )
    expect(ProjectTypeSchema.options).toHaveLength(10)
  })
})

describe('ConfigSchema', () => {
  it('accepts a valid minimal config', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
    })
    expect(result.success).toBe(true)
  })

  it('accepts a valid full config', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'custom',
      platforms: ['claude-code', 'codex'],
      custom: {
        default_depth: 3,
        steps: {
          'prd': { enabled: true, depth: 2 },
        },
      },
      project: {
        name: 'my-app',
        platforms: ['web'],
      },
    })
    expect(result.success).toBe(true)
  })

  it('accepts a valid config with gemini platform', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code', 'gemini'],
    })
    expect(result.success).toBe(true)
  })

  it('uses default methodology when methodology is missing', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      platforms: ['claude-code'],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.methodology).toBe('deep')
    }
  })

  it('uses default platforms when platforms is missing', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.platforms).toEqual(['claude-code'])
    }
  })

  it('fails when platforms is empty', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: [],
    })
    expect(result.success).toBe(false)
  })

  it('fails with invalid methodology enum', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'extreme',
      platforms: ['claude-code'],
    })
    expect(result.success).toBe(false)
  })

  it('fails with invalid platform enum', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['unknown-platform'],
    })
    expect(result.success).toBe(false)
  })

  it('fails when depth is out of 1-5 range', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'custom',
      platforms: ['claude-code'],
      custom: {
        steps: {
          'prd': { depth: 6 },
        },
      },
    })
    expect(result.success).toBe(false)
  })

  it('fails when depth is below 1', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'custom',
      platforms: ['claude-code'],
      custom: {
        default_depth: 0,
      },
    })
    expect(result.success).toBe(false)
  })

  it('passes unknown top-level fields through (passthrough)', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      future_field: 'some-value',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>)['future_field']).toBe('some-value')
    }
  })

  it('passes unknown project fields through (passthrough on project)', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        name: 'my-app',
        unknown_project_field: true,
      },
    })
    expect(result.success).toBe(true)
  })

  it('fails when version is not 2', () => {
    const result = ConfigSchema.safeParse({
      version: 1,
      methodology: 'deep',
      platforms: ['claude-code'],
    })
    expect(result.success).toBe(false)
  })
})

describe('GameConfigSchema', () => {
  it('accepts valid game config with all fields', () => {
    const result = GameConfigSchema.safeParse({
      engine: 'unity',
      multiplayerMode: 'online',
      narrative: 'heavy',
      contentStructure: 'open-world',
      economy: 'monetized',
      onlineServices: ['leaderboards', 'matchmaking'],
      persistence: 'cloud',
      targetPlatforms: ['pc', 'ps5'],
      supportedLocales: ['en', 'ja'],
      hasModding: true,
      npcAiComplexity: 'complex',
    })
    expect(result.success).toBe(true)
  })

  it('applies defaults for all fields except engine', () => {
    const result = GameConfigSchema.safeParse({
      engine: 'godot',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({
        engine: 'godot',
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
      })
    }
  })

  it('rejects invalid engine value', () => {
    const result = GameConfigSchema.safeParse({
      engine: 'rpgmaker',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid targetPlatform value', () => {
    const result = GameConfigSchema.safeParse({
      engine: 'unity',
      targetPlatforms: ['pc', 'commodore64'],
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty targetPlatforms array', () => {
    const result = GameConfigSchema.safeParse({
      engine: 'unity',
      targetPlatforms: [],
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty supportedLocales array', () => {
    const result = GameConfigSchema.safeParse({
      engine: 'unity',
      supportedLocales: [],
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid locale format', () => {
    const result = GameConfigSchema.safeParse({
      engine: 'unity',
      supportedLocales: ['english'],
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid locale codes (xx and xx-XX)', () => {
    const result = GameConfigSchema.safeParse({
      engine: 'unity',
      supportedLocales: ['en', 'en-US', 'ja', 'fr-FR'],
    })
    expect(result.success).toBe(true)
  })
})

describe('ConfigSchema with projectType and gameConfig', () => {
  it('config without projectType still passes (backwards compatible)', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        name: 'my-app',
      },
    })
    expect(result.success).toBe(true)
  })

  it('config with projectType game and valid gameConfig passes', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        name: 'my-game',
        projectType: 'game',
        gameConfig: {
          engine: 'unreal',
          multiplayerMode: 'hybrid',
          narrative: 'light',
          contentStructure: 'mission-based',
          economy: 'both',
          onlineServices: ['accounts', 'live-ops'],
          persistence: 'profile',
          targetPlatforms: ['pc', 'xbox'],
          supportedLocales: ['en', 'fr'],
          hasModding: false,
          npcAiComplexity: 'simple',
        },
      },
    })
    expect(result.success).toBe(true)
  })

  it('config with projectType game and only engine set gets defaults', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        name: 'my-game',
        projectType: 'game',
        gameConfig: {
          engine: 'godot',
        },
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      const project = result.data.project as Record<string, unknown>
      const gc = project['gameConfig'] as Record<string, unknown>
      expect(gc).toEqual({
        engine: 'godot',
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
      })
    }
  })

  it('rejects gameConfig when projectType is not game', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        name: 'my-web-app',
        projectType: 'web-app',
        gameConfig: {
          engine: 'unity',
        },
      },
    })
    expect(result.success).toBe(false)
  })

  it('rejects gameConfig when projectType is missing', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        name: 'my-app',
        gameConfig: {
          engine: 'unity',
        },
      },
    })
    expect(result.success).toBe(false)
  })

  it('accepts non-game projectType without gameConfig', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        name: 'my-api',
        projectType: 'backend',
      },
    })
    expect(result.success).toBe(true)
  })
})

describe('WebAppConfigSchema', () => {
  it('requires renderingStrategy', () => {
    const result = WebAppConfigSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('accepts valid config with defaults', () => {
    const result = WebAppConfigSchema.parse({ renderingStrategy: 'ssr' })
    expect(result).toEqual({
      renderingStrategy: 'ssr',
      deployTarget: 'serverless',
      realtime: 'none',
      authFlow: 'none',
    })
  })

  it('rejects unknown fields (.strict())', () => {
    const result = WebAppConfigSchema.safeParse({
      renderingStrategy: 'spa',
      unknownField: 'value',
    })
    expect(result.success).toBe(false)
  })
})

describe('BackendConfigSchema', () => {
  it('requires apiStyle', () => {
    const result = BackendConfigSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('accepts valid config with defaults', () => {
    const result = BackendConfigSchema.parse({ apiStyle: 'rest' })
    expect(result).toEqual({
      apiStyle: 'rest',
      dataStore: ['relational'],
      authMechanism: 'none',
      asyncMessaging: 'none',
      deployTarget: 'container',
      domain: 'none',
    })
  })

  it('enforces dataStore min(1)', () => {
    const result = BackendConfigSchema.safeParse({
      apiStyle: 'rest',
      dataStore: [],
    })
    expect(result.success).toBe(false)
  })

  it('accepts apiStyle none for workers', () => {
    const result = BackendConfigSchema.parse({ apiStyle: 'none' })
    expect(result.apiStyle).toBe('none')
  })
})

describe('BackendConfigSchema — domain field', () => {
  it('defaults `domain` to \'none\' when omitted', () => {
    const result = BackendConfigSchema.parse({
      apiStyle: 'rest',
    })
    expect(result.domain).toBe('none')
  })

  it('accepts `domain: \'fintech\'`', () => {
    const result = BackendConfigSchema.parse({
      apiStyle: 'rest',
      domain: 'fintech',
    })
    expect(result.domain).toBe('fintech')
  })

  it('rejects invalid `domain` values', () => {
    expect(() => BackendConfigSchema.parse({
      apiStyle: 'rest',
      domain: 'healthcare',
    })).toThrow()
  })
})

describe('CliConfigSchema', () => {
  it('requires interactivity', () => {
    const result = CliConfigSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('accepts valid config with defaults', () => {
    const result = CliConfigSchema.parse({ interactivity: 'hybrid' })
    expect(result).toEqual({
      interactivity: 'hybrid',
      distributionChannels: ['package-manager'],
      hasStructuredOutput: false,
    })
  })

  it('enforces distributionChannels min(1)', () => {
    const result = CliConfigSchema.safeParse({
      interactivity: 'args-only',
      distributionChannels: [],
    })
    expect(result.success).toBe(false)
  })
})

describe('ProjectSchema cross-field validation', () => {
  it('rejects webAppConfig with non-web-app projectType', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        projectType: 'backend',
        webAppConfig: { renderingStrategy: 'spa' },
      },
    })
    expect(result.success).toBe(false)
  })

  it('accepts webAppConfig with web-app projectType', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        projectType: 'web-app',
        webAppConfig: { renderingStrategy: 'spa' },
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects SSR + static deploy', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        projectType: 'web-app',
        webAppConfig: { renderingStrategy: 'ssr', deployTarget: 'static' },
      },
    })
    expect(result.success).toBe(false)
  })

  it('rejects hybrid + static deploy', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        projectType: 'web-app',
        webAppConfig: { renderingStrategy: 'hybrid', deployTarget: 'static' },
      },
    })
    expect(result.success).toBe(false)
  })

  it('rejects session auth + static deploy', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        projectType: 'web-app',
        webAppConfig: { renderingStrategy: 'spa', deployTarget: 'static', authFlow: 'session' },
      },
    })
    expect(result.success).toBe(false)
  })

  it('allows projectType web-app without webAppConfig', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: { projectType: 'web-app' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects backendConfig with non-backend projectType', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        projectType: 'web-app',
        backendConfig: { apiStyle: 'rest' },
      },
    })
    expect(result.success).toBe(false)
  })

  it('rejects cliConfig with non-cli projectType', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        projectType: 'game',
        cliConfig: { interactivity: 'hybrid' },
      },
    })
    expect(result.success).toBe(false)
  })
})

describe('LibraryConfigSchema', () => {
  it('requires visibility', () => {
    const result = LibraryConfigSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('accepts valid config with defaults', () => {
    const result = LibraryConfigSchema.parse({ visibility: 'public' })
    expect(result).toEqual({
      visibility: 'public',
      runtimeTarget: 'isomorphic',
      bundleFormat: 'dual',
      hasTypeDefinitions: true,
      documentationLevel: 'readme',
    })
  })

  it('accepts internal visibility', () => {
    const result = LibraryConfigSchema.parse({ visibility: 'internal' })
    expect(result.visibility).toBe('internal')
  })

  it('rejects unknown fields (.strict())', () => {
    const result = LibraryConfigSchema.safeParse({
      visibility: 'public',
      unknownField: 'value',
    })
    expect(result.success).toBe(false)
  })
})

describe('MobileAppConfigSchema', () => {
  it('requires platform', () => {
    const result = MobileAppConfigSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('accepts valid config with defaults', () => {
    const result = MobileAppConfigSchema.parse({ platform: 'cross-platform' })
    expect(result).toEqual({
      platform: 'cross-platform',
      distributionModel: 'public',
      offlineSupport: 'none',
      hasPushNotifications: false,
    })
  })

  it('accepts all platform values', () => {
    for (const platform of ['ios', 'android', 'cross-platform'] as const) {
      const result = MobileAppConfigSchema.parse({ platform })
      expect(result.platform).toBe(platform)
    }
  })

  it('rejects unknown fields (.strict())', () => {
    const result = MobileAppConfigSchema.safeParse({
      platform: 'ios',
      unknownField: 'value',
    })
    expect(result.success).toBe(false)
  })
})

describe('ProjectSchema cross-field validation — library and mobile-app', () => {
  it('rejects libraryConfig with non-library projectType', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        projectType: 'backend',
        libraryConfig: { visibility: 'public' },
      },
    })
    expect(result.success).toBe(false)
  })

  it('accepts libraryConfig with library projectType', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        projectType: 'library',
        libraryConfig: { visibility: 'public' },
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects mobileAppConfig with non-mobile-app projectType', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        projectType: 'web-app',
        mobileAppConfig: { platform: 'ios' },
      },
    })
    expect(result.success).toBe(false)
  })

  it('accepts mobileAppConfig with mobile-app projectType', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        projectType: 'mobile-app',
        mobileAppConfig: { platform: 'android' },
      },
    })
    expect(result.success).toBe(true)
  })

  it('allows library projectType without libraryConfig', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: { projectType: 'library' },
    })
    expect(result.success).toBe(true)
  })

  it('allows mobile-app projectType without mobileAppConfig', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: { projectType: 'mobile-app' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects public library with documentationLevel none', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        projectType: 'library',
        libraryConfig: { visibility: 'public', documentationLevel: 'none' },
      },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const msgs = result.error.issues.map(i => i.message)
      expect(msgs).toContain(
        'Public libraries should have documentation'
        + ' (documentationLevel: none with visibility: public)',
      )
    }
  })

  it('allows public library with documentation', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        projectType: 'library',
        libraryConfig: { visibility: 'public', documentationLevel: 'api-docs' },
      },
    })
    expect(result.success).toBe(true)
  })

  it('allows internal library with no documentation', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        projectType: 'library',
        libraryConfig: { visibility: 'internal', documentationLevel: 'none' },
      },
    })
    expect(result.success).toBe(true)
  })
})

describe('DataPipelineConfigSchema', () => {
  it('requires processingModel', () => {
    const result = DataPipelineConfigSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('accepts valid config with defaults', () => {
    const result = DataPipelineConfigSchema.parse({ processingModel: 'batch' })
    expect(result).toEqual({
      processingModel: 'batch',
      orchestration: 'none',
      dataQualityStrategy: 'validation',
      schemaManagement: 'none',
      hasDataCatalog: false,
    })
  })

  it('rejects unknown fields (.strict())', () => {
    const result = DataPipelineConfigSchema.safeParse({
      processingModel: 'streaming',
      unknownField: 'value',
    })
    expect(result.success).toBe(false)
  })
})

describe('MlConfigSchema', () => {
  it('requires projectPhase', () => {
    const result = MlConfigSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('accepts valid config with defaults', () => {
    const result = MlConfigSchema.parse({ projectPhase: 'training' })
    expect(result).toEqual({
      projectPhase: 'training',
      modelType: 'deep-learning',
      servingPattern: 'none',
      hasExperimentTracking: true,
    })
  })

  it('rejects unknown fields (.strict())', () => {
    const result = MlConfigSchema.safeParse({
      projectPhase: 'both',
      unknownField: 'value',
    })
    expect(result.success).toBe(false)
  })
})

describe('BrowserExtensionConfigSchema', () => {
  it('accepts config with all defaults (no required fields)', () => {
    const result = BrowserExtensionConfigSchema.parse({})
    expect(result).toEqual({
      manifestVersion: '3',
      uiSurfaces: ['popup'],
      hasContentScript: false,
      hasBackgroundWorker: true,
    })
  })

  it('rejects unknown fields (.strict())', () => {
    const result = BrowserExtensionConfigSchema.safeParse({
      unknownField: 'value',
    })
    expect(result.success).toBe(false)
  })
})

describe('ProjectSchema cross-field validation — new project types', () => {
  it('rejects dataPipelineConfig with non-data-pipeline projectType', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        projectType: 'backend',
        dataPipelineConfig: { processingModel: 'batch' },
      },
    })
    expect(result.success).toBe(false)
  })

  it('rejects mlConfig with non-ml projectType', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        projectType: 'backend',
        mlConfig: { projectPhase: 'training' },
      },
    })
    expect(result.success).toBe(false)
  })

  it('rejects browserExtensionConfig with non-browser-extension projectType', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        projectType: 'web-app',
        browserExtensionConfig: {},
      },
    })
    expect(result.success).toBe(false)
  })

  it('rejects ML inference with servingPattern none', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        projectType: 'ml',
        mlConfig: { projectPhase: 'inference', servingPattern: 'none' },
      },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const msgs = result.error.issues.map(i => i.message)
      expect(msgs).toContain('Inference projects must specify a serving pattern')
    }
  })

  it('rejects ML training with servingPattern set', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        projectType: 'ml',
        mlConfig: { projectPhase: 'training', servingPattern: 'realtime' },
      },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const msgs = result.error.issues.map(i => i.message)
      expect(msgs).toContain('Training-only projects should not have a serving pattern')
    }
  })

  it('rejects browser extension with no capabilities', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        projectType: 'browser-extension',
        browserExtensionConfig: {
          uiSurfaces: [],
          hasContentScript: false,
          hasBackgroundWorker: false,
        },
      },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const msgs = result.error.issues.map(i => i.message)
      expect(msgs).toContain(
        'Extension must have at least one UI surface, content script, or background worker',
      )
    }
  })

  it('accepts ML both phase with realtime serving', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        projectType: 'ml',
        mlConfig: { projectPhase: 'both', servingPattern: 'realtime' },
      },
    })
    expect(result.success).toBe(true)
  })

  it('accepts browser extension with defaults', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        projectType: 'browser-extension',
        browserExtensionConfig: {},
      },
    })
    expect(result.success).toBe(true)
  })
})

describe('ResearchConfigSchema', () => {
  it('accepts valid research config with all fields', () => {
    const result = ResearchConfigSchema.safeParse({
      experimentDriver: 'code-driven',
      interactionMode: 'autonomous',
      hasExperimentTracking: false,
      domain: 'quant-finance',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({
        experimentDriver: 'code-driven',
        interactionMode: 'autonomous',
        hasExperimentTracking: false,
        domain: 'quant-finance',
      })
    }
  })

  it('applies defaults for all fields except experimentDriver', () => {
    const result = ResearchConfigSchema.safeParse({
      experimentDriver: 'api-driven',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({
        experimentDriver: 'api-driven',
        interactionMode: 'checkpoint-gated',
        hasExperimentTracking: true,
        domain: 'none',
      })
    }
  })

  it('rejects missing experimentDriver', () => {
    const result = ResearchConfigSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects unknown fields (.strict())', () => {
    const result = ResearchConfigSchema.safeParse({
      experimentDriver: 'code-driven',
      unknownField: 'value',
    })
    expect(result.success).toBe(false)
  })
})

describe('ProjectSchema cross-field validation — research', () => {
  it('rejects researchConfig when projectType is not research', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        projectType: 'backend',
        researchConfig: { experimentDriver: 'code-driven' },
      },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const msgs = result.error.issues.map(i => i.message)
      expect(msgs).toContain('researchConfig requires projectType: research')
    }
  })

  it('rejects notebook-driven + autonomous', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        projectType: 'research',
        researchConfig: {
          experimentDriver: 'notebook-driven',
          interactionMode: 'autonomous',
        },
      },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const msgs = result.error.issues.map(i => i.message)
      expect(msgs).toContain('Notebook-driven execution cannot be fully autonomous')
    }
  })

  it('accepts notebook-driven + checkpoint-gated', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        projectType: 'research',
        researchConfig: {
          experimentDriver: 'notebook-driven',
          interactionMode: 'checkpoint-gated',
        },
      },
    })
    expect(result.success).toBe(true)
  })

  it('accepts valid research config with research projectType', () => {
    const result = ConfigSchema.safeParse({
      version: 2, methodology: 'deep', platforms: ['claude-code'],
      project: {
        projectType: 'research',
        researchConfig: { experimentDriver: 'config-driven' },
      },
    })
    expect(result.success).toBe(true)
  })
})

describe('ServiceSchema', () => {
  const validBackendService = {
    name: 'research-engine',
    projectType: 'backend' as const,
    backendConfig: {
      apiStyle: 'rest' as const,
      dataStore: ['relational'] as const,
      authMechanism: 'apikey' as const,
      asyncMessaging: 'none' as const,
      deployTarget: 'container' as const,
      domain: 'fintech' as const,
    },
  }

  it('accepts a valid backend service', () => {
    const result = ServiceSchema.safeParse(validBackendService)
    expect(result.success).toBe(true)
  })

  it('rejects name that violates kebab-case regex', () => {
    const invalid = [
      { ...validBackendService, name: 'Research-Engine' },    // uppercase
      { ...validBackendService, name: '1research' },           // leading digit
      { ...validBackendService, name: 'research engine' },     // whitespace
      { ...validBackendService, name: 'research.engine' },     // dot
      { ...validBackendService, name: '' },                    // empty (caught by min(1) first)
    ]
    for (const s of invalid) {
      expect(ServiceSchema.safeParse(s).success).toBe(false)
    }
  })

  it('rejects config set without matching projectType (coupling)', () => {
    const result = ServiceSchema.safeParse({
      name: 'foo',
      projectType: 'backend',
      webAppConfig: { renderingStrategy: 'ssr', deployTarget: 'container',
        realtime: 'none', authFlow: 'none' },
      backendConfig: validBackendService.backendConfig,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map(i => i.path.join('.'))
      expect(paths).toContain('webAppConfig')
    }
  })

  it('rejects projectType without matching config (forward rule — ServiceSchema-only)', () => {
    const result = ServiceSchema.safeParse({ name: 'foo', projectType: 'backend' })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map(i => i.path.join('.'))
      expect(paths).toContain('backendConfig')
    }
  })

  it('emits BOTH coupling and forward issues for a doubly-malformed service', () => {
    const result = ServiceSchema.safeParse({
      name: 'foo',
      projectType: 'web-app',
      backendConfig: validBackendService.backendConfig,
      // No webAppConfig.
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map(i => i.path.join('.'))
      expect(paths).toContain('backendConfig')   // coupling violation
      expect(paths).toContain('webAppConfig')    // forward-direction violation
    }
  })

  it('rejects extra fields via .strict()', () => {
    const result = ServiceSchema.safeParse({
      ...validBackendService,
      extraField: 'x',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find(i => i.code === 'unrecognized_keys')
      expect(issue).toBeDefined()
      const keys = (issue as unknown as { keys?: string[] }).keys
      expect(keys).toContain('extraField')
    }
  })

  it('rejects missing projectType', () => {
    const result = ServiceSchema.safeParse({ name: 'foo' })
    expect(result.success).toBe(false)
  })

  it('rejects unknown projectType value', () => {
    const result = ServiceSchema.safeParse({
      name: 'foo', projectType: 'totally-made-up',
    })
    expect(result.success).toBe(false)
  })

  describe('exports field (Wave 3c)', () => {
    const validService = {
      name: 'shared-lib',
      projectType: 'library' as const,
      libraryConfig: { visibility: 'internal' as const },
    }

    it('accepts a service with exports', () => {
      const result = ServiceSchema.safeParse({
        ...validService,
        exports: [{ step: 'api-contracts' }, { step: 'domain-modeling' }],
      })
      expect(result.success).toBe(true)
    })

    it('accepts a service with no exports field (closed by default)', () => {
      const result = ServiceSchema.safeParse(validService)
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.exports).toBeUndefined()
    })

    it('rejects exports with a malformed kebab-case step slug', () => {
      const result = ServiceSchema.safeParse({
        ...validService,
        exports: [{ step: 'Not_Kebab' }],
      })
      expect(result.success).toBe(false)
    })

    it('rejects exports with empty step string', () => {
      const result = ServiceSchema.safeParse({
        ...validService,
        exports: [{ step: '' }],
      })
      expect(result.success).toBe(false)
    })
  })

  describe('exports global-step rejection (ProjectSchema superRefine)', () => {
    const GLOBAL_STEP = 'service-ownership-map'  // known global step from multi-service-overlay

    it('rejects a service that exports a global step', () => {
      const result = ProjectSchema.safeParse({
        services: [{
          name: 'api',
          projectType: 'backend',
          backendConfig: { apiStyle: 'rest' },
          exports: [{ step: GLOBAL_STEP }],
        }],
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        const msgs = result.error.issues.map(i => i.message).join(' | ')
        expect(msgs).toMatch(/global step/i)
      }
    })

    it('accepts a service exporting a non-global step', () => {
      const result = ProjectSchema.safeParse({
        services: [{
          name: 'api',
          projectType: 'backend',
          backendConfig: { apiStyle: 'rest' },
          exports: [{ step: 'api-contracts' }],
        }],
      })
      expect(result.success).toBe(true)
    })
  })
})

describe('ProjectSchema.services refinements', () => {
  const backendService = {
    name: 'research-engine',
    projectType: 'backend' as const,
    backendConfig: {
      apiStyle: 'rest' as const,
      dataStore: ['relational'] as const,
      authMechanism: 'apikey' as const,
      asyncMessaging: 'none' as const,
      deployTarget: 'container' as const,
      domain: 'none' as const,
    },
  }

  it('accepts a project with one service and no root projectType', () => {
    const result = ProjectSchema.safeParse({ services: [backendService] })
    expect(result.success).toBe(true)
  })

  it('accepts a project with services AND root projectType (backcompat — D-BC)', () => {
    const result = ProjectSchema.safeParse({
      projectType: 'backend',
      backendConfig: backendService.backendConfig,
      services: [backendService],
    })
    expect(result.success).toBe(true)
  })

  it('accepts a project with no projectType and no services (backcompat — D-BC)', () => {
    expect(ProjectSchema.safeParse({}).success).toBe(true)
  })

  it('rejects empty services array via .min(1)', () => {
    const result = ProjectSchema.safeParse({ services: [] })
    expect(result.success).toBe(false)
  })

  it('rejects services with duplicate names', () => {
    const result = ProjectSchema.safeParse({
      services: [
        backendService,
        { ...backendService, name: 'research-engine' },
      ],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const dupIssue = result.error.issues.find(i => i.path.join('.') === 'services')
      expect(dupIssue?.message).toMatch(/Duplicate service names/i)
    }
  })

  it('accepts services with distinct names', () => {
    const result = ProjectSchema.safeParse({
      services: [
        backendService,
        { ...backendService, name: 'trading-bot' },
      ],
    })
    expect(result.success).toBe(true)
  })
})

describe('domain field — multi-domain union', () => {
  const baseBackend = {
    apiStyle: 'rest' as const,
    dataStore: ['relational'] as const,
    authMechanism: 'jwt' as const,
    asyncMessaging: 'none' as const,
    deployTarget: 'container' as const,
  }

  const baseResearch = {
    experimentDriver: 'code-driven' as const,
    interactionMode: 'checkpoint-gated' as const,
    hasExperimentTracking: true,
  }

  it('exports canonical real-domain arrays', () => {
    expect(backendRealDomains).toEqual(['fintech'])
    expect(researchRealDomains).toEqual(['quant-finance', 'ml-research', 'simulation'])
  })

  it('accepts domain as single-element array on backend', () => {
    const result = BackendConfigSchema.safeParse({ ...baseBackend, domain: ['fintech'] })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.domain).toEqual(['fintech'])
  })

  it('accepts domain as multi-element array on research', () => {
    const result = ResearchConfigSchema.safeParse({
      ...baseResearch, domain: ['quant-finance', 'ml-research'],
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.domain).toEqual(['quant-finance', 'ml-research'])
  })

  it('rejects empty array', () => {
    expect(BackendConfigSchema.safeParse({ ...baseBackend, domain: [] }).success).toBe(false)
  })

  it("rejects ['none'] (none disallowed inside array)", () => {
    expect(BackendConfigSchema.safeParse({ ...baseBackend, domain: ['none'] }).success).toBe(false)
  })

  it("rejects ['none', 'fintech']", () => {
    expect(BackendConfigSchema.safeParse({ ...baseBackend, domain: ['none', 'fintech'] }).success).toBe(false)
  })

  it('rejects unknown domain string', () => {
    expect(BackendConfigSchema.safeParse({ ...baseBackend, domain: 'climate' }).success).toBe(false)
  })

  it('rejects null domain', () => {
    expect(BackendConfigSchema.safeParse({ ...baseBackend, domain: null }).success).toBe(false)
  })

  it('preserves string shape through YAML roundtrip', () => {
    const parsed = BackendConfigSchema.parse({ ...baseBackend, domain: 'fintech' })
    const dumped = yaml.dump(parsed)
    const reparsed = BackendConfigSchema.parse(yaml.load(dumped))
    expect(reparsed.domain).toBe('fintech')
  })

  it('preserves array shape through YAML roundtrip', () => {
    const parsed = BackendConfigSchema.parse({ ...baseBackend, domain: ['fintech'] })
    const dumped = yaml.dump(parsed)
    const reparsed = BackendConfigSchema.parse(yaml.load(dumped))
    expect(reparsed.domain).toEqual(['fintech'])
  })

  it('defaults to "none" when domain omitted', () => {
    const result = BackendConfigSchema.safeParse(baseBackend)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.domain).toBe('none')
  })
})
