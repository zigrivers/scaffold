import { describe, it, expect, expectTypeOf } from 'vitest'
import {
  PROJECT_TYPE_FLAG,
  GAME_FLAGS, WEB_FLAGS, BACKEND_FLAGS, CLI_TYPE_FLAGS,
  LIB_FLAGS, MOBILE_FLAGS, PIPELINE_FLAGS, ML_FLAGS, EXT_FLAGS,
  RESEARCH_FLAGS, MCP_SERVER_FLAGS,
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

  // -------------------------------------------------------------------------
  // Research flags
  // -------------------------------------------------------------------------

  it('rejects --research-driver with --project-type ml (type consistency)', () => {
    const argv = { 'project-type': 'ml', 'research-driver': 'code-driven' }
    expect(() => applyFlagFamilyValidation(argv))
      .toThrow(/--research-\* flags require --project-type research/)
  })

  it('rejects notebook-driven + autonomous (cross-field)', () => {
    const argv = {
      'project-type': 'research',
      'research-driver': 'notebook-driven',
      'research-interaction': 'autonomous',
    }
    expect(() => applyFlagFamilyValidation(argv))
      .toThrow(/Notebook-driven execution cannot be fully autonomous/)
  })

  it('rejects mixing --research-driver and --ml-phase (mixed family)', () => {
    const argv = { 'research-driver': 'code-driven', 'ml-phase': 'training' }
    expect(() => applyFlagFamilyValidation(argv))
      .toThrow(/Cannot mix flags from multiple project types/)
  })

  it('accepts valid --research-driver code-driven with --project-type research', () => {
    const argv = { 'project-type': 'research', 'research-driver': 'code-driven' }
    expect(() => applyFlagFamilyValidation(argv)).not.toThrow()
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

  it('maps --backend-domain=fintech to BackendConfig.domain via buildFlagOverrides', () => {
    const result = buildFlagOverrides({
      'backend-api-style': 'rest',
      'backend-domain': 'fintech',
    })
    expect(result).toEqual({
      type: 'backend',
      partial: { apiStyle: 'rest', domain: 'fintech' },
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

  it('returns research partial', () => {
    const argv = {
      'research-driver': 'code-driven',
      'research-interaction': 'checkpoint-gated',
      'research-domain': 'ml-research',
      'research-tracking': true,
    }
    const result = buildFlagOverrides(argv)
    expect(result).toEqual({
      type: 'research',
      partial: {
        experimentDriver: 'code-driven',
        interactionMode: 'checkpoint-gated',
        domain: 'ml-research',
        hasExperimentTracking: true,
      },
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
      | 'backend-messaging' | 'backend-deploy-target' | 'backend-domain'
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

  it('RESEARCH_FLAGS[number] narrows to literal union', () => {
    expectTypeOf<typeof RESEARCH_FLAGS[number]>().toEqualTypeOf<
      'research-driver' | 'research-interaction' | 'research-domain' | 'research-tracking'
    >()
  })
})

// ---------------------------------------------------------------------------
// mcp-server flag family
// ---------------------------------------------------------------------------

describe('mcp-server auto-detect via flag', () => {
  it('--mcp-language typescript with no --project-type detects mcp-server family', () => {
    // buildFlagOverrides delegates to detectFamily internally; asserting its output
    // is the canonical way to verify family detection without exporting detectFamily.
    const result = buildFlagOverrides({ 'mcp-language': 'typescript' })
    expect(result).toEqual({
      type: 'mcp-server',
      partial: { language: 'typescript' },
    })
  })
})

describe('macos-native flags', () => {
  it('rejects macos flags with a non-macos project type', () => {
    expect(() => applyFlagFamilyValidation({ 'macos-ui-framework': 'swiftui', 'project-type': 'web-app' }))
      .toThrow(/macos/i)
  })
  it('rejects mac-app-store + sparkle', () => {
    expect(() => applyFlagFamilyValidation({ 'macos-distribution': 'mac-app-store', 'macos-auto-update': 'sparkle' }))
      .toThrow(/App Store/i)
  })
  it('rejects swiftdata below macOS 14', () => {
    expect(() => applyFlagFamilyValidation({ 'macos-persistence': 'swiftdata', 'macos-min-version': '13.0' }))
      .toThrow(/SwiftData/i)
  })
  it('maps flags into a macos-native partial', () => {
    const out = buildFlagOverrides({ 'macos-ui-framework': 'hybrid', 'macos-distribution': 'developer-id' })
    expect(out).toEqual({ type: 'macos-native', partial: { uiFramework: 'hybrid', distribution: 'developer-id' } })
  })
})

describe('mcp-server flag family', () => {
  it('buildFlagOverrides maps --mcp-* to McpServerConfig partial', () => {
    const out = buildFlagOverrides({
      'mcp-language': 'python', 'mcp-transport': 'streamable-http', 'mcp-auth': 'oauth',
    })
    expect(out).toEqual({
      type: 'mcp-server',
      partial: { language: 'python', transport: 'streamable-http', auth: 'oauth' },
    })
  })

  it('rejects mixing --mcp-* with another family', () => {
    expect(() => applyFlagFamilyValidation({ 'mcp-language': 'python', 'web-rendering': 'spa' }))
      .toThrow(/multiple project types/)
  })

  it('rejects --mcp-* with a conflicting --project-type', () => {
    expect(() => applyFlagFamilyValidation({ 'mcp-language': 'python', 'project-type': 'cli' }))
      .toThrow(/--project-type mcp-server/)
  })

  it('rejects --mcp-auth other than none with explicit --mcp-transport stdio', () => {
    // Explicit stdio + non-none auth must be rejected at flag-validation time
    expect(() => applyFlagFamilyValidation({ 'mcp-transport': 'stdio', 'mcp-auth': 'oauth' }))
      .toThrow(/stdio transport cannot use network auth/)
  })

  it('does NOT reject --mcp-auth oauth when --mcp-transport is absent (wizard resolves transport)', () => {
    // Absent transport means the wizard will prompt for or default the transport.
    // Flag validation must NOT pre-reject: the user might pick streamable-http interactively.
    // (Round-1 test INVERTED: was "throws", now "does not throw".)
    expect(() => applyFlagFamilyValidation({ 'mcp-language': 'typescript', 'mcp-auth': 'oauth' }))
      .not.toThrow()
  })

  it('accepts --mcp-auth oauth with --mcp-transport streamable-http', () => {
    const argv = { 'mcp-language': 'typescript', 'mcp-transport': 'streamable-http', 'mcp-auth': 'oauth' }
    expect(() => applyFlagFamilyValidation(argv)).not.toThrow()
  })

  it('does NOT reject --mcp-deployment hosted when --mcp-transport is absent (wizard resolves transport)', () => {
    // Absent transport means the wizard will prompt for or default the transport.
    // Flag validation must NOT pre-reject. (Round-2 test INVERTED: was "throws", now "does not throw".)
    expect(() => applyFlagFamilyValidation({ 'mcp-language': 'typescript', 'mcp-deployment': 'hosted' }))
      .not.toThrow()
  })

  it('rejects --mcp-deployment hosted with explicit --mcp-transport stdio', () => {
    // Explicit stdio + hosted deployment must still be rejected at flag-validation time
    expect(() => applyFlagFamilyValidation({ 'mcp-transport': 'stdio', 'mcp-deployment': 'hosted' }))
      .toThrow(/hosted deployment requires a non-stdio transport/)
  })

  it('accepts --mcp-deployment hosted with --mcp-transport streamable-http', () => {
    const argv = { 'mcp-language': 'typescript', 'mcp-transport': 'streamable-http', 'mcp-deployment': 'hosted' }
    expect(() => applyFlagFamilyValidation(argv)).not.toThrow()
  })

  it('MCP_SERVER_FLAGS preserves its literal members', () => {
    const f: typeof MCP_SERVER_FLAGS[number] = 'mcp-language'
    expect(MCP_SERVER_FLAGS).toContain(f)
  })

  // Fix 5: --mcp-primitives enum validation
  it('rejects invalid --mcp-primitives value', () => {
    expect(() => applyFlagFamilyValidation({ 'mcp-language': 'typescript', 'mcp-primitives': ['bogus'] }))
      .toThrow(/Invalid --mcp-primitives value/)
  })

  it('rejects mixed valid+invalid --mcp-primitives values', () => {
    expect(() => applyFlagFamilyValidation({ 'mcp-language': 'typescript', 'mcp-primitives': ['tools', 'bogus'] }))
      .toThrow(/Invalid --mcp-primitives value/)
  })

  it('accepts valid --mcp-primitives values', () => {
    expect(() => applyFlagFamilyValidation({ 'mcp-language': 'typescript', 'mcp-primitives': ['tools', 'resources'] }))
      .not.toThrow()
  })

  it('accepts single valid --mcp-primitives value', () => {
    expect(() => applyFlagFamilyValidation({ 'mcp-language': 'typescript', 'mcp-primitives': ['prompts'] }))
      .not.toThrow()
  })
})
