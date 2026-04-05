// src/config/schema.test.ts

import { describe, it, expect } from 'vitest'
import { ConfigSchema, GameConfigSchema } from './schema.js'

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

  it('fails when methodology is missing', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      platforms: ['claude-code'],
    })
    expect(result.success).toBe(false)
  })

  it('fails when platforms is missing', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
    })
    expect(result.success).toBe(false)
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
