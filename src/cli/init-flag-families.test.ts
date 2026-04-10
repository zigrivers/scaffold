import { describe, it, expect, expectTypeOf } from 'vitest'
import {
  PROJECT_TYPE_FLAG,
  GAME_FLAGS, WEB_FLAGS, BACKEND_FLAGS, CLI_TYPE_FLAGS,
  LIB_FLAGS, MOBILE_FLAGS, PIPELINE_FLAGS, ML_FLAGS, EXT_FLAGS,
  applyFlagFamilyValidation,
  buildFlagOverrides,
} from './init-flag-families.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('flag family constants', () => {
  it('PROJECT_TYPE_FLAG is the canonical yargs key', () => {
    expect(PROJECT_TYPE_FLAG).toBe('project-type')
  })

  it('GAME_FLAGS contains expected game-specific flag names', () => {
    expect(GAME_FLAGS).toContain('engine')
    expect(GAME_FLAGS).toContain('multiplayer')
  })

  it('WEB_FLAGS contains rendering strategy flag', () => {
    expect(WEB_FLAGS).toContain('web-rendering')
  })

  it('BACKEND_FLAGS contains api style flag', () => {
    expect(BACKEND_FLAGS).toContain('backend-api-style')
  })
})

// ---------------------------------------------------------------------------
// applyFlagFamilyValidation
// ---------------------------------------------------------------------------

describe('applyFlagFamilyValidation', () => {
  it('returns true with empty argv (no flags set)', () => {
    expect(applyFlagFamilyValidation({})).toBe(true)
  })

  it('accepts single-family flags with matching --project-type', () => {
    const argv = { 'project-type': 'web-app', 'web-rendering': 'ssr' }
    expect(() => applyFlagFamilyValidation(argv)).not.toThrow()
  })

  it('rejects mixing web and backend flags', () => {
    const argv = { 'web-rendering': 'ssr', 'backend-api-style': 'rest' }
    expect(() => applyFlagFamilyValidation(argv))
      .toThrow(/Cannot mix flags from multiple project types/)
  })

  it('rejects mixing game flags with web flags', () => {
    const argv = { engine: 'unity', 'web-rendering': 'ssr' }
    expect(() => applyFlagFamilyValidation(argv))
      .toThrow(/Cannot mix flags from multiple project types/)
  })

  it('rejects --web-* with --project-type backend', () => {
    const argv = { 'project-type': 'backend', 'web-rendering': 'ssr' }
    expect(() => applyFlagFamilyValidation(argv))
      .toThrow(/--web-\* flags require --project-type web-app/)
  })

  it('rejects --backend-* with --project-type web-app', () => {
    const argv = { 'project-type': 'web-app', 'backend-api-style': 'rest' }
    expect(() => applyFlagFamilyValidation(argv))
      .toThrow(/--backend-\* flags require --project-type backend/)
  })

  it('rejects game flags with --project-type non-game', () => {
    const argv = { 'project-type': 'web-app', engine: 'unity' }
    expect(() => applyFlagFamilyValidation(argv))
      .toThrow(/Game flags .* require --project-type game/)
  })

  it('rejects --online-services without --multiplayer online|hybrid', () => {
    const argv = { 'online-services': ['leaderboards'], multiplayer: 'none' }
    expect(() => applyFlagFamilyValidation(argv))
      .toThrow(/--online-services requires --multiplayer/)
  })

  it('accepts --online-services with --multiplayer online', () => {
    const argv = { 'online-services': ['leaderboards'], multiplayer: 'online' }
    expect(() => applyFlagFamilyValidation(argv)).not.toThrow()
  })

  it('rejects invalid backend-data-store value', () => {
    const argv = { 'backend-data-store': ['relational', 'bogus'] }
    expect(() => applyFlagFamilyValidation(argv))
      .toThrow(/Invalid --backend-data-store/)
  })

  it('rejects invalid cli-distribution value', () => {
    const argv = { 'cli-distribution': ['bogus'] }
    expect(() => applyFlagFamilyValidation(argv))
      .toThrow(/Invalid --cli-distribution/)
  })

  it('rejects invalid ext-ui-surfaces value', () => {
    const argv = { 'ext-ui-surfaces': ['popup', 'bogus'] }
    expect(() => applyFlagFamilyValidation(argv))
      .toThrow(/Invalid --ext-ui-surfaces/)
  })

  it('rejects invalid target-platforms value', () => {
    const argv = { 'target-platforms': ['pc', 'bogus'] }
    expect(() => applyFlagFamilyValidation(argv))
      .toThrow(/Invalid target platform/)
  })

  it('rejects invalid locale value', () => {
    const argv = { locales: ['not-a-locale!'] }
    expect(() => applyFlagFamilyValidation(argv))
      .toThrow(/Invalid locale/)
  })

  it('rejects SSR + static deploy target (web cross-field)', () => {
    const argv = {
      'project-type': 'web-app',
      'web-rendering': 'ssr',
      'web-deploy-target': 'static',
    }
    expect(() => applyFlagFamilyValidation(argv))
      .toThrow(/SSR\/hybrid rendering requires compute/)
  })

  it('rejects hybrid + static deploy target (web cross-field)', () => {
    const argv = {
      'project-type': 'web-app',
      'web-rendering': 'hybrid',
      'web-deploy-target': 'static',
    }
    expect(() => applyFlagFamilyValidation(argv))
      .toThrow(/SSR\/hybrid rendering requires compute/)
  })

  it('rejects session auth + static deploy target', () => {
    const argv = {
      'project-type': 'web-app',
      'web-auth-flow': 'session',
      'web-deploy-target': 'static',
    }
    expect(() => applyFlagFamilyValidation(argv))
      .toThrow(/Session auth requires server state/)
  })
})

// ---------------------------------------------------------------------------
// buildFlagOverrides
// ---------------------------------------------------------------------------

describe('buildFlagOverrides', () => {
  it('returns undefined when no type flags passed', () => {
    expect(buildFlagOverrides({})).toBeUndefined()
  })

  it('returns web-app partial when web flags are present', () => {
    const argv = { 'web-rendering': 'ssr', 'web-deploy-target': 'serverless' }
    const result = buildFlagOverrides(argv)
    expect(result).toEqual({
      type: 'web-app',
      partial: { renderingStrategy: 'ssr', deployTarget: 'serverless' },
    })
  })

  it('returns backend partial with dataStore array', () => {
    const argv = { 'backend-api-style': 'rest', 'backend-data-store': ['relational', 'document'] }
    const result = buildFlagOverrides(argv)
    expect(result).toEqual({
      type: 'backend',
      partial: { apiStyle: 'rest', dataStore: ['relational', 'document'] },
    })
  })

  it('returns game partial with engine and multiplayerMode mapping', () => {
    const argv = { engine: 'unity', multiplayer: 'none' }
    const result = buildFlagOverrides(argv)
    expect(result).toEqual({
      type: 'game',
      partial: { engine: 'unity', multiplayerMode: 'none' },
    })
  })

  it('returns game partial with locales mapped to supportedLocales', () => {
    const argv = { engine: 'godot', locales: ['en', 'fr-FR'] }
    const result = buildFlagOverrides(argv)
    expect(result).toEqual({
      type: 'game',
      partial: { engine: 'godot', supportedLocales: ['en', 'fr-FR'] },
    })
  })

  it('returns game partial with npc-ai mapped to npcAiComplexity', () => {
    const argv = { engine: 'unity', 'npc-ai': 'complex' }
    const result = buildFlagOverrides(argv)
    expect(result).toEqual({
      type: 'game',
      partial: { engine: 'unity', npcAiComplexity: 'complex' },
    })
  })

  it('returns game partial with modding mapped to hasModding', () => {
    const argv = { engine: 'unreal', modding: true }
    const result = buildFlagOverrides(argv)
    expect(result).toEqual({
      type: 'game',
      partial: { engine: 'unreal', hasModding: true },
    })
  })

  it('returns cli partial with distributionChannels array', () => {
    const argv = { 'cli-interactivity': 'hybrid', 'cli-distribution': ['package-manager'] }
    const result = buildFlagOverrides(argv)
    expect(result).toEqual({
      type: 'cli',
      partial: { interactivity: 'hybrid', distributionChannels: ['package-manager'] },
    })
  })

  it('returns library partial with visibility and bundleFormat', () => {
    const argv = { 'lib-visibility': 'public', 'lib-bundle-format': 'dual' }
    const result = buildFlagOverrides(argv)
    expect(result).toEqual({
      type: 'library',
      partial: { visibility: 'public', bundleFormat: 'dual' },
    })
  })

  it('returns mobile-app partial', () => {
    const argv = { 'mobile-platform': 'ios', 'mobile-push-notifications': true }
    const result = buildFlagOverrides(argv)
    expect(result).toEqual({
      type: 'mobile-app',
      partial: { platform: 'ios', hasPushNotifications: true },
    })
  })

  it('returns data-pipeline partial', () => {
    const argv = { 'pipeline-processing': 'streaming', 'pipeline-orchestration': 'event-driven' }
    const result = buildFlagOverrides(argv)
    expect(result).toEqual({
      type: 'data-pipeline',
      partial: { processingModel: 'streaming', orchestration: 'event-driven' },
    })
  })

  it('returns ml partial', () => {
    const argv = { 'ml-phase': 'training', 'ml-model-type': 'llm' }
    const result = buildFlagOverrides(argv)
    expect(result).toEqual({
      type: 'ml',
      partial: { projectPhase: 'training', modelType: 'llm' },
    })
  })

  it('returns browser-extension partial', () => {
    const argv = { 'ext-manifest': '3', 'ext-ui-surfaces': ['popup'], 'ext-content-script': true }
    const result = buildFlagOverrides(argv)
    expect(result).toEqual({
      type: 'browser-extension',
      partial: { manifestVersion: '3', uiSurfaces: ['popup'], hasContentScript: true },
    })
  })

  it('omits fields for flags not passed', () => {
    // Only --engine passed, no --multiplayer, --locales, etc.
    const result = buildFlagOverrides({ engine: 'unity' } as Record<string, unknown>)
    expect(result).toEqual({
      type: 'game',
      partial: { engine: 'unity' },
    })
    // Explicit absence assertions — guards against drive-by refactors that
    // accidentally write `undefined` into the partial.
    expect(result!.partial).not.toHaveProperty('multiplayerMode')
    expect(result!.partial).not.toHaveProperty('supportedLocales')
    expect(result!.partial).not.toHaveProperty('hasModding')
  })
})

// ---------------------------------------------------------------------------
// Type-level preservation tests (as const survives extraction)
// ---------------------------------------------------------------------------

describe('flag family type preservation (as const survives extraction)', () => {
  it('GAME_FLAGS[number] narrows to literal union', () => {
    expectTypeOf<typeof GAME_FLAGS[number]>().toEqualTypeOf<
      'engine' | 'multiplayer' | 'target-platforms' | 'online-services'
      | 'content-structure' | 'economy' | 'narrative' | 'locales'
      | 'npc-ai' | 'modding' | 'persistence'
    >()
  })

  it('WEB_FLAGS[number] narrows to literal union', () => {
    expectTypeOf<typeof WEB_FLAGS[number]>().toEqualTypeOf<
      'web-rendering' | 'web-deploy-target' | 'web-realtime' | 'web-auth-flow'
    >()
  })

  it('BACKEND_FLAGS[number] narrows to literal union', () => {
    expectTypeOf<typeof BACKEND_FLAGS[number]>().toEqualTypeOf<
      'backend-api-style' | 'backend-data-store' | 'backend-auth'
      | 'backend-messaging' | 'backend-deploy-target'
    >()
  })

  it('CLI_TYPE_FLAGS[number] narrows to literal union', () => {
    expectTypeOf<typeof CLI_TYPE_FLAGS[number]>().toEqualTypeOf<
      'cli-interactivity' | 'cli-distribution' | 'cli-structured-output'
    >()
  })

  it('LIB_FLAGS[number] narrows to literal union', () => {
    expectTypeOf<typeof LIB_FLAGS[number]>().toEqualTypeOf<
      'lib-visibility' | 'lib-runtime-target' | 'lib-bundle-format'
      | 'lib-type-definitions' | 'lib-doc-level'
    >()
  })

  it('MOBILE_FLAGS[number] narrows to literal union', () => {
    expectTypeOf<typeof MOBILE_FLAGS[number]>().toEqualTypeOf<
      'mobile-platform' | 'mobile-distribution' | 'mobile-offline' | 'mobile-push-notifications'
    >()
  })

  it('PIPELINE_FLAGS[number] narrows to literal union', () => {
    expectTypeOf<typeof PIPELINE_FLAGS[number]>().toEqualTypeOf<
      'pipeline-processing' | 'pipeline-orchestration'
      | 'pipeline-quality' | 'pipeline-schema' | 'pipeline-catalog'
    >()
  })

  it('ML_FLAGS[number] narrows to literal union', () => {
    expectTypeOf<typeof ML_FLAGS[number]>().toEqualTypeOf<
      'ml-phase' | 'ml-model-type' | 'ml-serving' | 'ml-experiment-tracking'
    >()
  })

  it('EXT_FLAGS[number] narrows to literal union', () => {
    expectTypeOf<typeof EXT_FLAGS[number]>().toEqualTypeOf<
      'ext-manifest' | 'ext-ui-surfaces' | 'ext-content-script' | 'ext-background-worker'
    >()
  })
})
