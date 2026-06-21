import { describe, it, expect, vi } from 'vitest'
import { askWizardQuestions } from './questions.js'

function makeOutputContext() {
  return {
    success: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    result: vi.fn(),
    supportsInteractivePrompts: vi.fn().mockReturnValue(false),
    prompt: vi.fn().mockResolvedValue(''),
    confirm: vi.fn(),
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

describe('askWizardQuestions', () => {
  it('adds codex after accepting the codex prompt (gemini prompt removed)', async () => {
    const output = makeOutputContext()
    vi.mocked(output.confirm)
      .mockResolvedValueOnce(true)    // Codex
      .mockResolvedValueOnce(false)   // web
      .mockResolvedValueOnce(false)   // mobile
    vi.mocked(output.select)
      .mockResolvedValueOnce('web-app')  // projectType

    const result = await askWizardQuestions({
      output,
      suggestion: 'deep',
      methodology: 'deep',
      auto: false,
    })

    expect(result.platforms).toEqual(['claude-code', 'codex'])
  })

  it('non-game projectType does not trigger game questions', async () => {
    const output = makeOutputContext()
    vi.mocked(output.confirm)
      .mockResolvedValueOnce(false)   // Codex
      .mockResolvedValueOnce(false)   // web
      .mockResolvedValueOnce(false)   // mobile
    vi.mocked(output.select)
      .mockResolvedValueOnce('backend')  // projectType

    const result = await askWizardQuestions({
      output,
      suggestion: 'deep',
      methodology: 'deep',
      auto: false,
    })

    expect(result.projectType).toBe('backend')
    expect(result.gameConfig).toBeUndefined()
    // select called for: projectType + apiStyle + authMechanism + asyncMessaging + deployTarget + domain
    // never for engine/multiplayer/etc. (game questions not triggered)
    expect(output.select).toHaveBeenCalledTimes(6)
  })

  it('game projectType triggers engine question and returns gameConfig', async () => {
    const output = makeOutputContext()
    vi.mocked(output.confirm)
      .mockResolvedValueOnce(false)   // Codex
      .mockResolvedValueOnce(false)   // web
      .mockResolvedValueOnce(false)   // mobile
      .mockResolvedValueOnce(false)   // advanced options
    vi.mocked(output.select)
      .mockResolvedValueOnce('game')     // projectType
      .mockResolvedValueOnce('godot')    // engine
      .mockResolvedValueOnce('none')     // multiplayer
      .mockResolvedValueOnce('discrete') // contentStructure
      .mockResolvedValueOnce('none')     // economy
    vi.mocked(output.multiSelect)
      .mockResolvedValueOnce(['pc', 'web'])  // targetPlatforms

    const result = await askWizardQuestions({
      output,
      suggestion: 'deep',
      methodology: 'deep',
      auto: false,
    })

    expect(result.projectType).toBe('game')
    expect(result.gameConfig).toBeDefined()
    expect(result.gameConfig!.engine).toBe('godot')
    expect(result.gameConfig!.multiplayerMode).toBe('none')
    expect(result.gameConfig!.targetPlatforms).toEqual(['pc', 'web'])
    expect(result.gameConfig!.contentStructure).toBe('discrete')
    expect(result.gameConfig!.economy).toBe('none')
    // Defaults for non-advanced options
    expect(result.gameConfig!.narrative).toBe('none')
    expect(result.gameConfig!.supportedLocales).toEqual(['en'])
    expect(result.gameConfig!.npcAiComplexity).toBe('none')
    expect(result.gameConfig!.hasModding).toBe(false)
    expect(result.gameConfig!.persistence).toBe('progression')
  })

  it('online multiplayer triggers onlineServices question', async () => {
    const output = makeOutputContext()
    vi.mocked(output.confirm)
      .mockResolvedValueOnce(false)   // Codex
      .mockResolvedValueOnce(false)   // web
      .mockResolvedValueOnce(false)   // mobile
      .mockResolvedValueOnce(false)   // advanced options
    vi.mocked(output.select)
      .mockResolvedValueOnce('game')     // projectType
      .mockResolvedValueOnce('unity')    // engine
      .mockResolvedValueOnce('online')   // multiplayer
      .mockResolvedValueOnce('discrete') // contentStructure
      .mockResolvedValueOnce('none')     // economy
    vi.mocked(output.multiSelect)
      .mockResolvedValueOnce(['pc'])                     // targetPlatforms
      .mockResolvedValueOnce(['matchmaking', 'accounts']) // onlineServices

    const result = await askWizardQuestions({
      output,
      suggestion: 'deep',
      methodology: 'deep',
      auto: false,
    })

    expect(result.gameConfig!.multiplayerMode).toBe('online')
    expect(result.gameConfig!.onlineServices).toEqual(['matchmaking', 'accounts'])
  })

  it('auto mode creates standard project (game requires interactive wizard)', async () => {
    const output = makeOutputContext()

    const result = await askWizardQuestions({
      output,
      suggestion: 'deep',
      methodology: 'deep',
      auto: true,
    })

    expect(result.projectType).toBeUndefined()
    expect(result.gameConfig).toBeUndefined()
    expect(output.select).not.toHaveBeenCalled()
    expect(output.confirm).not.toHaveBeenCalled()
  })

  it('--project-type game --auto produces valid gameConfig with Zod defaults', async () => {
    const output = makeOutputContext()

    const result = await askWizardQuestions({
      output,
      suggestion: 'deep',
      methodology: 'deep',
      auto: true,
      projectType: 'game',
    })

    expect(result.projectType).toBe('game')
    expect(result.gameConfig).toBeDefined()
    // Zod defaults from GameConfigSchema.parse({ engine: 'custom' })
    expect(result.gameConfig!.engine).toBe('custom')
    expect(result.gameConfig!.multiplayerMode).toBe('none')
    expect(result.gameConfig!.narrative).toBe('none')
    expect(result.gameConfig!.contentStructure).toBe('discrete')
    expect(result.gameConfig!.economy).toBe('none')
    expect(result.gameConfig!.persistence).toBe('progression')
    // No interactive prompts should have been called
    expect(output.select).not.toHaveBeenCalled()
    expect(output.confirm).not.toHaveBeenCalled()
  })

  it('--project-type web-app skips game questions entirely', async () => {
    const output = makeOutputContext()
    vi.mocked(output.confirm)
      .mockResolvedValueOnce(false)   // Codex
      .mockResolvedValueOnce(false)   // web
      .mockResolvedValueOnce(false)   // mobile
    vi.mocked(output.select)
      .mockResolvedValueOnce('spa')          // renderingStrategy
      .mockResolvedValueOnce('serverless')   // deployTarget
      .mockResolvedValueOnce('none')         // realtime
      .mockResolvedValueOnce('none')         // authFlow

    const result = await askWizardQuestions({
      output,
      suggestion: 'deep',
      methodology: 'deep',
      auto: false,
      projectType: 'web-app',
    })

    expect(result.projectType).toBe('web-app')
    expect(result.gameConfig).toBeUndefined()
    // web-app select questions were asked, game questions were NOT
    expect(result.webAppConfig).toBeDefined()
    expect(result.webAppConfig!.renderingStrategy).toBe('spa')
  })

  it('--project-type game (interactive) skips projectType select but still asks game questions', async () => {
    const output = makeOutputContext()
    vi.mocked(output.confirm)
      .mockResolvedValueOnce(false)   // Codex
      .mockResolvedValueOnce(false)   // web
      .mockResolvedValueOnce(false)   // mobile
      .mockResolvedValueOnce(false)   // advanced options
    vi.mocked(output.select)
      .mockResolvedValueOnce('unity')    // engine
      .mockResolvedValueOnce('local')    // multiplayer
      .mockResolvedValueOnce('open-world') // contentStructure
      .mockResolvedValueOnce('progression') // economy
    vi.mocked(output.multiSelect)
      .mockResolvedValueOnce(['pc', 'ps5'])  // targetPlatforms

    const result = await askWizardQuestions({
      output,
      suggestion: 'deep',
      methodology: 'deep',
      auto: false,
      projectType: 'game',
    })

    expect(result.projectType).toBe('game')
    expect(result.gameConfig).toBeDefined()
    expect(result.gameConfig!.engine).toBe('unity')
    expect(result.gameConfig!.multiplayerMode).toBe('local')
    expect(result.gameConfig!.targetPlatforms).toEqual(['pc', 'ps5'])
    // select was called for game sub-questions but NOT for projectType itself
    // engine, multiplayer, contentStructure, economy = 4 calls
    expect(output.select).toHaveBeenCalledTimes(4)
    // First select call should be engine, not projectType
    expect(output.select).toHaveBeenNthCalledWith(1, 'Game engine:',
      expect.arrayContaining([expect.objectContaining({ value: 'unity' })]),
      undefined,
      expect.any(Object),
    )
  })

  // --- Task 5: General flag-skip tests ---

  it('--depth flag overrides depth for custom methodology', async () => {
    const output = makeOutputContext()
    vi.mocked(output.confirm)
      .mockResolvedValueOnce(false)   // Codex
      .mockResolvedValueOnce(false)   // web
      .mockResolvedValueOnce(false)   // mobile
    vi.mocked(output.select)
      .mockResolvedValueOnce('cli')   // projectType

    const result = await askWizardQuestions({
      output,
      suggestion: 'deep',
      methodology: 'custom',
      auto: false,
      depth: 4,
    })

    expect(result.methodology).toBe('custom')
    expect(result.depth).toBe(4)
    // prompt should NOT have been called for depth (methodology was pre-set, depth was flagged)
    expect(output.prompt).not.toHaveBeenCalled()
  })

  it('--adapters flag skips platform confirm questions', async () => {
    const output = makeOutputContext()
    // No confirm mocks needed for Codex/Gemini — they should be skipped
    // But traits still need confirms (web, mobile)
    vi.mocked(output.confirm)
      .mockResolvedValueOnce(true)    // web
      .mockResolvedValueOnce(false)   // mobile
    vi.mocked(output.select)
      .mockResolvedValueOnce('backend')  // projectType

    const result = await askWizardQuestions({
      output,
      suggestion: 'deep',
      methodology: 'deep',
      auto: false,
      adapters: ['claude-code', 'codex', 'gemini'],
    })

    // a legacy `gemini` in --adapters is stripped (the CLI was dropped)
    expect(result.platforms).toEqual(['claude-code', 'codex'])
    // confirm called only twice (web + mobile), not four times (Codex + Gemini + web + mobile)
    expect(output.confirm).toHaveBeenCalledTimes(2)
  })

  it('--traits flag skips web/mobile confirm questions', async () => {
    const output = makeOutputContext()
    // No traits confirms needed — but platform confirms still fire
    // Plus library wizard asks "Ship type definitions?"
    vi.mocked(output.confirm)
      .mockResolvedValueOnce(false)   // Codex
      .mockResolvedValueOnce(false)   // OpenCode
      .mockResolvedValueOnce(true)    // Ship type definitions? (library)
    vi.mocked(output.select)
      .mockResolvedValueOnce('library')  // projectType
      .mockResolvedValueOnce('public')   // Library visibility
      .mockResolvedValueOnce('isomorphic') // Runtime target
      .mockResolvedValueOnce('dual')     // Bundle format
      .mockResolvedValueOnce('readme')   // Documentation level

    const result = await askWizardQuestions({
      output,
      suggestion: 'deep',
      methodology: 'deep',
      auto: false,
      traits: ['web', 'mobile'],
    })

    expect(result.traits).toEqual(['web', 'mobile'])
    // confirm called 3 times: Codex + OpenCode + Ship type definitions (library)
    expect(output.confirm).toHaveBeenCalledTimes(3)
  })

  it('--depth with --auto overrides auto default for custom methodology', async () => {
    const output = makeOutputContext()

    const result = await askWizardQuestions({
      output,
      suggestion: 'deep',
      methodology: 'custom',
      auto: true,
      depth: 2,
    })

    expect(result.methodology).toBe('custom')
    expect(result.depth).toBe(2)
    // Auto mode + flags: no interactive calls at all
    expect(output.prompt).not.toHaveBeenCalled()
    expect(output.select).not.toHaveBeenCalled()
    expect(output.confirm).not.toHaveBeenCalled()
  })

  // --- Task 6: Game flag-skip tests ---

  it('--engine flag skips engine question', async () => {
    const output = makeOutputContext()
    vi.mocked(output.confirm)
      .mockResolvedValueOnce(false)   // Codex
      .mockResolvedValueOnce(false)   // web
      .mockResolvedValueOnce(false)   // mobile
      .mockResolvedValueOnce(false)   // advanced options
    vi.mocked(output.select)
      .mockResolvedValueOnce('none')     // multiplayer (engine skipped via flag)
      .mockResolvedValueOnce('discrete') // contentStructure
      .mockResolvedValueOnce('none')     // economy
    vi.mocked(output.multiSelect)
      .mockResolvedValueOnce(['pc'])     // targetPlatforms

    const result = await askWizardQuestions({
      output,
      suggestion: 'deep',
      methodology: 'deep',
      auto: false,
      projectType: 'game',
      gameFlags: { engine: 'unreal' },
    })

    expect(result.gameConfig!.engine).toBe('unreal')
    // select called 3 times (multiplayer, contentStructure, economy) — engine was skipped
    expect(output.select).toHaveBeenCalledTimes(3)
    // First select call should be multiplayer, NOT engine
    expect(output.select).toHaveBeenNthCalledWith(1, 'Multiplayer mode:',
      expect.arrayContaining([expect.objectContaining({ value: 'none' })]),
      'none',
      expect.any(Object),
    )
  })

  it('--multiplayer flag is used', async () => {
    const output = makeOutputContext()

    const result = await askWizardQuestions({
      output,
      suggestion: 'deep',
      methodology: 'deep',
      auto: true,
      projectType: 'game',
      gameFlags: { multiplayer: 'online' },
    })

    expect(result.gameConfig!.multiplayerMode).toBe('online')
    // In auto mode with online multiplayer, onlineServices should get Zod default ([])
    expect(result.gameConfig!.onlineServices).toEqual([])
    expect(output.select).not.toHaveBeenCalled()
  })

  it('--target-platforms flag is used', async () => {
    const output = makeOutputContext()

    const result = await askWizardQuestions({
      output,
      suggestion: 'deep',
      methodology: 'deep',
      auto: true,
      projectType: 'game',
      gameFlags: { targetPlatforms: ['pc', 'ps5', 'xbox'] },
    })

    expect(result.gameConfig!.targetPlatforms).toEqual(['pc', 'ps5', 'xbox'])
    expect(output.multiSelect).not.toHaveBeenCalled()
  })

  it('advanced flag (--narrative) forces advanced gate open and asks remaining questions', async () => {
    const output = makeOutputContext()
    vi.mocked(output.confirm)
      .mockResolvedValueOnce(false)   // Codex
      .mockResolvedValueOnce(false)   // OpenCode
      .mockResolvedValueOnce(false)   // web
      .mockResolvedValueOnce(false)   // mobile
      // No advanced gate confirm — it should be auto-opened by --narrative flag
      .mockResolvedValueOnce(true)    // modding (advanced, unflagged)
    vi.mocked(output.select)
      .mockResolvedValueOnce('godot')    // engine
      .mockResolvedValueOnce('none')     // multiplayer
      .mockResolvedValueOnce('discrete') // contentStructure
      .mockResolvedValueOnce('none')     // economy
      // Advanced unflagged questions:
      .mockResolvedValueOnce('complex')      // npcAiComplexity
      .mockResolvedValueOnce('cloud')        // persistence
    vi.mocked(output.multiSelect)
      .mockResolvedValueOnce(['pc'])         // targetPlatforms
    vi.mocked(output.multiInput)
      .mockResolvedValueOnce(['en', 'ja'])   // locales (advanced, unflagged)

    const result = await askWizardQuestions({
      output,
      suggestion: 'deep',
      methodology: 'deep',
      auto: false,
      projectType: 'game',
      gameFlags: { narrative: 'heavy' },
    })

    // The flagged value should be used directly
    expect(result.gameConfig!.narrative).toBe('heavy')
    // The remaining advanced questions should have been asked interactively
    expect(result.gameConfig!.supportedLocales).toEqual(['en', 'ja'])
    expect(result.gameConfig!.npcAiComplexity).toBe('complex')
    expect(result.gameConfig!.hasModding).toBe(true)
    expect(result.gameConfig!.persistence).toBe('cloud')
    // confirm should NOT have been called for the advanced gate
    // Total confirms: Codex, OpenCode, web, mobile, modding = 5
    expect(output.confirm).toHaveBeenCalledTimes(5)
    // Advanced gate confirm should never fire — verify no call with that text
    for (const call of output.confirm.mock.calls) {
      expect(call[0]).not.toBe('Configure advanced game options?')
    }
  })

  it('--auto with game flags overrides defaults (engine, multiplayer, economy, etc.)', async () => {
    const output = makeOutputContext()

    const result = await askWizardQuestions({
      output,
      suggestion: 'deep',
      methodology: 'deep',
      auto: true,
      projectType: 'game',
      gameFlags: {
        engine: 'unity',
        multiplayer: 'hybrid',
        targetPlatforms: ['pc', 'ps5'],
        onlineServices: ['matchmaking', 'leaderboards'],
        contentStructure: 'open-world',
        economy: 'monetized',
        narrative: 'heavy',
        locales: ['en', 'ja', 'de'],
        npcAi: 'complex',
        modding: true,
        persistence: 'cloud',
      },
    })

    // Every flag should override the Zod/auto defaults
    expect(result.gameConfig).toBeDefined()
    expect(result.gameConfig!.engine).toBe('unity')
    expect(result.gameConfig!.multiplayerMode).toBe('hybrid')
    expect(result.gameConfig!.targetPlatforms).toEqual(['pc', 'ps5'])
    expect(result.gameConfig!.onlineServices).toEqual(['matchmaking', 'leaderboards'])
    expect(result.gameConfig!.contentStructure).toBe('open-world')
    expect(result.gameConfig!.economy).toBe('monetized')
    expect(result.gameConfig!.narrative).toBe('heavy')
    expect(result.gameConfig!.supportedLocales).toEqual(['en', 'ja', 'de'])
    expect(result.gameConfig!.npcAiComplexity).toBe('complex')
    expect(result.gameConfig!.hasModding).toBe(true)
    expect(result.gameConfig!.persistence).toBe('cloud')
    // No interactive calls in auto mode
    expect(output.select).not.toHaveBeenCalled()
    expect(output.confirm).not.toHaveBeenCalled()
    expect(output.multiSelect).not.toHaveBeenCalled()
    expect(output.prompt).not.toHaveBeenCalled()
  })
})

// --- Task 12: Web-app, backend, CLI flag-skip tests ---

describe('web-app wizard questions', () => {
  it('uses flag values when provided (skips prompts)', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output, suggestion: 'deep', methodology: 'deep', auto: false,
      projectType: 'web-app',
      webAppFlags: {
        webRendering: 'ssr',
        webDeployTarget: 'container',
        webRealtime: 'websocket',
        webAuthFlow: 'oauth',
      },
    })
    expect(answers.webAppConfig).toEqual({
      renderingStrategy: 'ssr',
      deployTarget: 'container',
      realtime: 'websocket',
      authFlow: 'oauth',
    })
    // All 4 web-app questions were provided via flags — no select calls for web-app questions
    // (platform confirms still fire: Codex, Gemini, web, mobile)
    expect(output.select).not.toHaveBeenCalled()
  })

  it('throws in auto mode without required --web-rendering', async () => {
    const output = makeOutputContext()

    await expect(askWizardQuestions({
      output, suggestion: 'deep', auto: true,
      methodology: 'deep',
      projectType: 'web-app',
    })).rejects.toThrow('--web-rendering is required')
  })

  it('uses defaults in auto mode when anchor flag is provided', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output, suggestion: 'deep', auto: true,
      methodology: 'deep',
      projectType: 'web-app',
      webAppFlags: { webRendering: 'spa' },
    })
    expect(answers.webAppConfig).toEqual({
      renderingStrategy: 'spa',
      deployTarget: 'serverless',
      realtime: 'none',
      authFlow: 'none',
    })
  })
})

describe('backend wizard questions', () => {
  it('uses flag values when provided', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output, suggestion: 'deep', methodology: 'deep', auto: false,
      projectType: 'backend',
      backendFlags: {
        backendApiStyle: 'graphql',
        backendDataStore: ['relational', 'key-value'],
        backendAuth: 'jwt',
        backendMessaging: 'queue',
        backendDeployTarget: 'serverless',
        backendDomain: 'none',
      },
    })
    expect(answers.backendConfig).toEqual({
      apiStyle: 'graphql',
      dataStore: ['relational', 'key-value'],
      authMechanism: 'jwt',
      asyncMessaging: 'queue',
      deployTarget: 'serverless',
      domain: 'none',
    })
    // All backend questions were provided via flags — no select/multiSelect calls
    expect(output.select).not.toHaveBeenCalled()
    expect(output.multiSelect).not.toHaveBeenCalled()
  })

  it('throws in auto mode without required --backend-api-style', async () => {
    const output = makeOutputContext()

    await expect(askWizardQuestions({
      output, suggestion: 'deep', auto: true,
      methodology: 'deep',
      projectType: 'backend',
    })).rejects.toThrow('--backend-api-style is required')
  })

  it('defaults domain to \'none\' in auto mode when --backend-domain is not provided', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output, suggestion: 'deep', auto: true, methodology: 'deep',
      projectType: 'backend',
      backendFlags: {
        backendApiStyle: 'rest',
      },
    })
    expect(answers.backendConfig?.domain).toBe('none')
  })

  it('uses backendDomain flag value \'fintech\' in auto mode', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output, suggestion: 'deep', auto: true, methodology: 'deep',
      projectType: 'backend',
      backendFlags: {
        backendApiStyle: 'rest',
        backendDomain: 'fintech',
      },
    })
    expect(answers.backendConfig?.domain).toBe('fintech')
  })

  it('prompts \'Backend domain?\' in interactive mode and records \'fintech\' answer', async () => {
    const output = makeOutputContext()
    vi.mocked(output.select)
      .mockResolvedValueOnce('rest')       // apiStyle
      .mockResolvedValueOnce('none')       // authMechanism
      .mockResolvedValueOnce('none')       // asyncMessaging
      .mockResolvedValueOnce('container')  // deployTarget
      .mockResolvedValueOnce('fintech')    // domain
    vi.mocked(output.multiSelect)
      .mockResolvedValueOnce(['relational'])

    const answers = await askWizardQuestions({
      output, suggestion: 'deep', auto: false, methodology: 'deep',
      projectType: 'backend',
    })
    expect(answers.backendConfig?.domain).toBe('fintech')
    const selectCalls = vi.mocked(output.select).mock.calls
    expect(selectCalls.some(call => call[0] === 'Backend domain?')).toBe(true)
  })
})

describe('cli wizard questions', () => {
  it('uses flag values when provided', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output, suggestion: 'deep', methodology: 'deep', auto: false,
      projectType: 'cli',
      cliFlags: {
        cliInteractivity: 'hybrid',
        cliDistribution: ['package-manager', 'standalone-binary'],
        cliStructuredOutput: true,
      },
    })
    expect(answers.cliConfig).toEqual({
      interactivity: 'hybrid',
      distributionChannels: ['package-manager', 'standalone-binary'],
      hasStructuredOutput: true,
    })
    // All CLI questions were provided via flags — no select/multiSelect/confirm calls for CLI questions
    expect(output.select).not.toHaveBeenCalled()
    expect(output.multiSelect).not.toHaveBeenCalled()
  })

  it('throws in auto mode without required --cli-interactivity', async () => {
    const output = makeOutputContext()

    await expect(askWizardQuestions({
      output, suggestion: 'deep', auto: true,
      methodology: 'deep',
      projectType: 'cli',
    })).rejects.toThrow('--cli-interactivity is required')
  })
})

describe('library wizard questions', () => {
  it('uses flag values when all 5 flags provided (skips prompts)', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output, suggestion: 'deep', methodology: 'deep', auto: false,
      projectType: 'library',
      libraryFlags: {
        libVisibility: 'public',
        libRuntimeTarget: 'isomorphic',
        libBundleFormat: 'dual',
        libTypeDefinitions: true,
        libDocLevel: 'api-docs',
      },
    })
    expect(answers.libraryConfig).toEqual({
      visibility: 'public',
      runtimeTarget: 'isomorphic',
      bundleFormat: 'dual',
      hasTypeDefinitions: true,
      documentationLevel: 'api-docs',
    })
    // All library questions were provided via flags — no select/confirm calls for library questions
    // Platform confirms still fire: Codex, Gemini, web, mobile
    expect(output.select).not.toHaveBeenCalled()
  })

  it('throws in auto mode without required --lib-visibility', async () => {
    const output = makeOutputContext()

    await expect(askWizardQuestions({
      output, suggestion: 'deep', auto: true,
      methodology: 'deep',
      projectType: 'library',
    })).rejects.toThrow('--lib-visibility is required')
  })

  it('uses defaults in auto mode when --lib-visibility is provided', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output, suggestion: 'deep', auto: true,
      methodology: 'deep',
      projectType: 'library',
      libraryFlags: { libVisibility: 'internal' },
    })
    expect(answers.libraryConfig).toEqual({
      visibility: 'internal',
      runtimeTarget: 'isomorphic',
      bundleFormat: 'dual',
      hasTypeDefinitions: true,
      documentationLevel: 'readme',
    })
    expect(output.select).not.toHaveBeenCalled()
    expect(output.confirm).not.toHaveBeenCalled()
  })
})

describe('mobile-app wizard questions', () => {
  it('uses flag values when all 4 flags provided (skips prompts)', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output, suggestion: 'deep', methodology: 'deep', auto: false,
      projectType: 'mobile-app',
      mobileAppFlags: {
        mobilePlatform: 'ios',
        mobileDistribution: 'public',
        mobileOffline: 'cache',
        mobilePushNotifications: true,
      },
    })
    expect(answers.mobileAppConfig).toEqual({
      platform: 'ios',
      distributionModel: 'public',
      offlineSupport: 'cache',
      hasPushNotifications: true,
    })
    // All mobile questions were provided via flags — no select/confirm calls for mobile questions
    expect(output.select).not.toHaveBeenCalled()
  })

  it('throws in auto mode without required --mobile-platform', async () => {
    const output = makeOutputContext()

    await expect(askWizardQuestions({
      output, suggestion: 'deep', auto: true,
      methodology: 'deep',
      projectType: 'mobile-app',
    })).rejects.toThrow('--mobile-platform is required')
  })
})

describe('data-pipeline wizard questions', () => {
  it('uses flag values when all flags provided (skips prompts)', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output, suggestion: 'deep', methodology: 'deep', auto: false,
      projectType: 'data-pipeline',
      dataPipelineFlags: {
        pipelineProcessing: 'streaming',
        pipelineOrchestration: 'event-driven',
        pipelineQuality: 'observability',
        pipelineSchema: 'schema-registry',
        pipelineCatalog: true,
      },
    })
    expect(answers.dataPipelineConfig).toEqual({
      processingModel: 'streaming',
      orchestration: 'event-driven',
      dataQualityStrategy: 'observability',
      schemaManagement: 'schema-registry',
      hasDataCatalog: true,
    })
    // All data-pipeline questions were provided via flags — no select calls for data-pipeline questions
    // Platform confirms still fire: Codex, Gemini, web, mobile
    expect(output.select).not.toHaveBeenCalled()
  })

  it('throws in auto mode without required --pipeline-processing', async () => {
    const output = makeOutputContext()

    await expect(askWizardQuestions({
      output, suggestion: 'deep', auto: true,
      methodology: 'deep',
      projectType: 'data-pipeline',
    })).rejects.toThrow('--pipeline-processing is required')
  })

  it('uses defaults in auto mode when --pipeline-processing is provided', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output, suggestion: 'deep', auto: true,
      methodology: 'deep',
      projectType: 'data-pipeline',
      dataPipelineFlags: { pipelineProcessing: 'batch' },
    })
    expect(answers.dataPipelineConfig).toEqual({
      processingModel: 'batch',
      orchestration: 'none',
      dataQualityStrategy: 'validation',
      schemaManagement: 'none',
      hasDataCatalog: false,
    })
    expect(output.select).not.toHaveBeenCalled()
    expect(output.confirm).not.toHaveBeenCalled()
  })
})

describe('ml wizard questions', () => {
  it('uses flag values when all flags provided (skips prompts)', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output, suggestion: 'deep', methodology: 'deep', auto: false,
      projectType: 'ml',
      mlFlags: {
        mlPhase: 'training',
        mlModelType: 'llm',
        mlServing: 'realtime',
        mlExperimentTracking: false,
      },
    })
    expect(answers.mlConfig).toEqual({
      projectPhase: 'training',
      modelType: 'llm',
      servingPattern: 'realtime',
      hasExperimentTracking: false,
    })
    // All ml questions were provided via flags — no select calls for ml questions
    // Platform confirms still fire: Codex, Gemini, web, mobile
    expect(output.select).not.toHaveBeenCalled()
  })

  it('throws in auto mode without required --ml-phase', async () => {
    const output = makeOutputContext()

    await expect(askWizardQuestions({
      output, suggestion: 'deep', auto: true,
      methodology: 'deep',
      projectType: 'ml',
    })).rejects.toThrow('--ml-phase is required')
  })

  it('uses defaults in auto mode when --ml-phase is training', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output, suggestion: 'deep', auto: true,
      methodology: 'deep',
      projectType: 'ml',
      mlFlags: { mlPhase: 'training' },
    })
    expect(answers.mlConfig).toEqual({
      projectPhase: 'training',
      modelType: 'deep-learning',
      servingPattern: 'none',
      hasExperimentTracking: true,
    })
    expect(output.select).not.toHaveBeenCalled()
  })

  it('defaults servingPattern to realtime in auto mode when --ml-phase is inference', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output, suggestion: 'deep', auto: true,
      methodology: 'deep',
      projectType: 'ml',
      mlFlags: { mlPhase: 'inference' },
    })
    expect(answers.mlConfig).toEqual({
      projectPhase: 'inference',
      modelType: 'deep-learning',
      servingPattern: 'realtime',
      hasExperimentTracking: true,
    })
    expect(output.select).not.toHaveBeenCalled()
  })

  it('defaults servingPattern to realtime in auto mode when --ml-phase is both', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output, suggestion: 'deep', auto: true,
      methodology: 'deep',
      projectType: 'ml',
      mlFlags: { mlPhase: 'both' },
    })
    expect(answers.mlConfig).toEqual({
      projectPhase: 'both',
      modelType: 'deep-learning',
      servingPattern: 'realtime',
      hasExperimentTracking: true,
    })
    expect(output.select).not.toHaveBeenCalled()
    expect(output.confirm).not.toHaveBeenCalled()
  })
})

describe('research wizard questions', () => {
  it('throws in auto mode without required --research-driver', async () => {
    const output = makeOutputContext()

    await expect(askWizardQuestions({
      output, suggestion: 'deep', auto: true,
      methodology: 'deep',
      projectType: 'research',
      researchFlags: {},
    })).rejects.toThrow('--research-driver is required')
  })

  it('auto mode with all flags returns matching researchConfig', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output, suggestion: 'deep', auto: true,
      methodology: 'deep',
      projectType: 'research',
      researchFlags: {
        researchDriver: 'api-driven',
        researchInteraction: 'autonomous',
        researchDomain: 'quant-finance',
        researchTracking: false,
      },
    })
    expect(answers.researchConfig).toEqual({
      experimentDriver: 'api-driven',
      interactionMode: 'autonomous',
      domain: 'quant-finance',
      hasExperimentTracking: false,
    })
    // No interactive calls in auto mode
    expect(output.select).not.toHaveBeenCalled()
    expect(output.confirm).not.toHaveBeenCalled()
  })

  it('auto mode with only --research-driver uses defaults for remaining fields', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output, suggestion: 'deep', auto: true,
      methodology: 'deep',
      projectType: 'research',
      researchFlags: { researchDriver: 'code-driven' },
    })
    expect(answers.researchConfig).toEqual({
      experimentDriver: 'code-driven',
      interactionMode: 'checkpoint-gated',
      domain: 'none',
      hasExperimentTracking: true,
    })
    expect(output.select).not.toHaveBeenCalled()
    expect(output.confirm).not.toHaveBeenCalled()
  })
})

describe('browser-extension wizard questions', () => {
  it('uses flag values when all flags provided (skips prompts)', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output, suggestion: 'deep', methodology: 'deep', auto: false,
      projectType: 'browser-extension',
      browserExtensionFlags: {
        extManifest: '3',
        extUiSurfaces: ['popup', 'sidepanel'],
        extContentScript: true,
        extBackgroundWorker: false,
      },
    })
    expect(answers.browserExtensionConfig).toEqual({
      manifestVersion: '3',
      uiSurfaces: ['popup', 'sidepanel'],
      hasContentScript: true,
      hasBackgroundWorker: false,
    })
    // All extension questions were provided via flags — no select calls for extension questions
    // Platform confirms still fire: Codex, Gemini, web, mobile
    expect(output.select).not.toHaveBeenCalled()
  })

  it('uses defaults in auto mode without any flags (browser-extension has no required flag)', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output, suggestion: 'deep', auto: true,
      methodology: 'deep',
      projectType: 'browser-extension',
    })
    expect(answers.browserExtensionConfig).toEqual({
      manifestVersion: '3',
      uiSurfaces: ['popup'],
      hasContentScript: false,
      hasBackgroundWorker: true,
    })
    expect(output.select).not.toHaveBeenCalled()
    expect(output.confirm).not.toHaveBeenCalled()
  })
})

describe('data-science wizard questions', () => {
  it('uses default audience in auto mode (no flags, no prompts)', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output, suggestion: 'deep', auto: true,
      methodology: 'deep',
      projectType: 'data-science',
    })
    expect(answers.projectType).toBe('data-science')
    expect(answers.dataScienceConfig).toEqual({ audience: 'solo' })
    expect(output.select).not.toHaveBeenCalled()
    expect(output.confirm).not.toHaveBeenCalled()
  })
})

describe('web3 wizard questions', () => {
  it('uses default scope in auto mode (no flags, no prompts)', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output, suggestion: 'deep', auto: true,
      methodology: 'deep',
      projectType: 'web3',
    })
    expect(answers.projectType).toBe('web3')
    expect(answers.web3Config).toEqual({ scope: 'contracts' })
    expect(output.select).not.toHaveBeenCalled()
    expect(output.confirm).not.toHaveBeenCalled()
  })
})

describe('mcp-server wizard (interactive mode)', () => {
  it('stdio transport skips auth + deployment prompts and forces auth=none, deployment=local', async () => {
    const output = makeOutputContext()
    vi.mocked(output.confirm)
      .mockResolvedValueOnce(false)   // Codex
      .mockResolvedValueOnce(false)   // web
      .mockResolvedValueOnce(false)   // mobile
      .mockResolvedValueOnce(false)   // stateful
    vi.mocked(output.select)
      .mockResolvedValueOnce('typescript')  // language
      .mockResolvedValueOnce('stdio')       // transport
    vi.mocked(output.multiSelect)
      .mockResolvedValueOnce(['tools'])     // primitives

    const answers = await askWizardQuestions({
      output,
      suggestion: 'deep',
      methodology: 'deep',
      auto: false,
      projectType: 'mcp-server',
    })

    expect(answers.mcpServerConfig).toBeDefined()
    expect(answers.mcpServerConfig!.transport).toBe('stdio')
    // stdio transport forces these — no prompts should have been called
    expect(answers.mcpServerConfig!.auth).toBe('none')
    expect(answers.mcpServerConfig!.deployment).toBe('local')
    // Verify auth and deployment select prompts were NOT called
    const selectLabels = vi.mocked(output.select).mock.calls.map(c => c[0])
    expect(selectLabels).not.toContain('Auth?')
    expect(selectLabels).not.toContain('Deployment?')
  })
})

describe('mcp-server wizard (interactive mode — empty primitives)', () => {
  it('throws when user selects no primitives', async () => {
    const output = makeOutputContext()
    vi.mocked(output.confirm)
      .mockResolvedValueOnce(false)   // Codex
      .mockResolvedValueOnce(false)   // web
      .mockResolvedValueOnce(false)   // mobile
    vi.mocked(output.select)
      .mockResolvedValueOnce('typescript')  // language
      .mockResolvedValueOnce('stdio')       // transport
    vi.mocked(output.multiSelect)
      .mockResolvedValueOnce([])            // primitives — empty selection

    await expect(askWizardQuestions({
      output,
      suggestion: 'deep',
      methodology: 'deep',
      auto: false,
      projectType: 'mcp-server',
    })).rejects.toThrow('Select at least one MCP primitive (tools, resources, or prompts).')
  })
})

describe('macos-native wizard branch', () => {
  it('produces a valid macosNativeConfig in auto mode from flags', async () => {
    const answers = await askWizardQuestions({
      output: makeOutputContext(),       // existing helper in this test file
      suggestion: 'deep',
      projectType: 'macos-native',
      auto: true,
      macosNativeFlags: {
        macosUiFramework: 'hybrid', macosDistribution: 'developer-id',
        macosPersistence: 'sqlite', macosAutoUpdate: 'sparkle',
      },
    })
    expect(answers.macosNativeConfig).toEqual({
      uiFramework: 'hybrid',
      appStyle: 'standard',
      minMacosVersion: '15.0',
      distribution: 'developer-id',
      sandboxed: false,
      persistence: 'sqlite',
      autoUpdate: 'sparkle',
    })
    // macos-native must record the desktop platform (→ project.platforms: ['desktop'])
    expect(answers.traits).toContain('desktop')
  })
})

describe('macos-native minMacosVersion format validation', () => {
  it('falls back to 15.0 and warns when macosMinVersion is a non-numeric string (e.g. "Sonoma")', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output,
      suggestion: 'deep',
      projectType: 'macos-native',
      auto: true,
      macosNativeFlags: {
        macosMinVersion: 'Sonoma',
      },
    })

    expect(answers.macosNativeConfig).toBeDefined()
    expect(answers.macosNativeConfig!.minMacosVersion).toBe('15.0')
    expect(output.warn).toHaveBeenCalledWith(
      expect.stringContaining('Invalid minMacosVersion'),
    )
  })
})

describe('macos-native SwiftData ⇒ macOS 14 guard', () => {
  it('bumps minMacosVersion to 14.0 and emits a warning when persistence=swiftdata and version<14', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output,
      suggestion: 'deep',
      projectType: 'macos-native',
      auto: true,
      macosNativeFlags: {
        macosPersistence: 'swiftdata',
        macosMinVersion: '13.0',
      },
    })

    expect(answers.macosNativeConfig).toBeDefined()
    expect(answers.macosNativeConfig!.minMacosVersion).toBe('14.0')
    // A warning should have been emitted about the bump
    expect(output.warn).toHaveBeenCalledWith(
      expect.stringContaining('SwiftData requires macOS 14.0+'),
    )
  })

  it('does not bump minMacosVersion when persistence=swiftdata and version is already 14.0', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output,
      suggestion: 'deep',
      projectType: 'macos-native',
      auto: true,
      macosNativeFlags: {
        macosPersistence: 'swiftdata',
        macosMinVersion: '14.0',
      },
    })

    expect(answers.macosNativeConfig!.minMacosVersion).toBe('14.0')
    expect(output.warn).not.toHaveBeenCalled()
  })

  it('does not bump when persistence is not swiftdata with an older version', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output,
      suggestion: 'deep',
      projectType: 'macos-native',
      auto: true,
      macosNativeFlags: {
        macosPersistence: 'core-data',
        macosMinVersion: '13.0',
      },
    })

    expect(answers.macosNativeConfig!.minMacosVersion).toBe('13.0')
    expect(output.warn).not.toHaveBeenCalled()
  })
})

describe('mcp-server wizard (auto mode)', () => {
  it('throws when --mcp-language missing in auto mode', async () => {
    const output = makeOutputContext()

    await expect(askWizardQuestions({
      output, suggestion: 'deep', auto: true,
      methodology: 'deep',
      projectType: 'mcp-server',
    })).rejects.toThrow(/--mcp-language is required/)
  })

  it('produces mcpServerConfig from flags with defaults', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output, suggestion: 'deep', auto: true,
      methodology: 'deep',
      projectType: 'mcp-server',
      mcpServerFlags: { mcpLanguage: 'python' },
    })
    expect(answers.mcpServerConfig).toEqual({
      language: 'python', transport: 'stdio', primitives: ['tools'],
      auth: 'none', deployment: 'local', stateful: false,
    })
    // No interactive calls in auto mode
    expect(output.select).not.toHaveBeenCalled()
    expect(output.confirm).not.toHaveBeenCalled()
    expect(output.multiSelect).not.toHaveBeenCalled()
  })

  // Fix 2(a): auto + streamable-http transport + no deployment flag → deployment defaults to 'local'
  it('auto + streamable-http transport with no --mcp-deployment flag defaults deployment to local', async () => {
    const output = makeOutputContext()

    const answers = await askWizardQuestions({
      output, suggestion: 'deep', auto: true,
      methodology: 'deep',
      projectType: 'mcp-server',
      mcpServerFlags: { mcpLanguage: 'typescript', mcpTransport: 'streamable-http' },
    })
    expect(answers.mcpServerConfig).toEqual({
      language: 'typescript', transport: 'streamable-http', primitives: ['tools'],
      auth: 'none', deployment: 'local', stateful: false,
    })
    expect(output.select).not.toHaveBeenCalled()
    expect(output.confirm).not.toHaveBeenCalled()
  })

  // Fix 2(b): auto + mcpAuth:'oauth' (transport defaults stdio) → wizard throws stdio/auth error
  it('auto + --mcp-auth oauth with no --mcp-transport throws stdio/auth contradiction', async () => {
    const output = makeOutputContext()

    await expect(askWizardQuestions({
      output, suggestion: 'deep', auto: true,
      methodology: 'deep',
      projectType: 'mcp-server',
      mcpServerFlags: { mcpLanguage: 'typescript', mcpAuth: 'oauth' },
    })).rejects.toThrow(/stdio transport cannot use network auth/)
  })
})
