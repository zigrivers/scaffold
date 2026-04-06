import { describe, it, expect, vi } from 'vitest'
import { askWizardQuestions } from './questions.js'

function makeOutputContext() {
  return {
    success: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    result: vi.fn(),
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
  it('allows adding Gemini after declining Codex', async () => {
    const output = makeOutputContext()
    vi.mocked(output.confirm)
      .mockResolvedValueOnce(false)   // Codex
      .mockResolvedValueOnce(true)    // Gemini
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

    expect(result.platforms).toEqual(['claude-code', 'gemini'])
  })

  it('non-game projectType does not trigger game questions', async () => {
    const output = makeOutputContext()
    vi.mocked(output.confirm)
      .mockResolvedValueOnce(false)   // Codex
      .mockResolvedValueOnce(false)   // Gemini
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
    // select called once (projectType only), never for engine/multiplayer/etc.
    expect(output.select).toHaveBeenCalledTimes(1)
  })

  it('game projectType triggers engine question and returns gameConfig', async () => {
    const output = makeOutputContext()
    vi.mocked(output.confirm)
      .mockResolvedValueOnce(false)   // Codex
      .mockResolvedValueOnce(false)   // Gemini
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
      .mockResolvedValueOnce(false)   // Gemini
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
      .mockResolvedValueOnce(false)   // Gemini
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
      .mockResolvedValueOnce(false)   // Gemini
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
    expect(output.select).toHaveBeenNthCalledWith(1, 'Game engine:', ['unity', 'unreal', 'godot', 'custom'])
  })

  // --- Task 5: General flag-skip tests ---

  it('--depth flag overrides depth for custom methodology', async () => {
    const output = makeOutputContext()
    vi.mocked(output.confirm)
      .mockResolvedValueOnce(false)   // Codex
      .mockResolvedValueOnce(false)   // Gemini
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

    expect(result.platforms).toEqual(['claude-code', 'codex', 'gemini'])
    // confirm called only twice (web + mobile), not four times (Codex + Gemini + web + mobile)
    expect(output.confirm).toHaveBeenCalledTimes(2)
  })

  it('--traits flag skips web/mobile confirm questions', async () => {
    const output = makeOutputContext()
    // No traits confirms needed — but platform confirms still fire
    vi.mocked(output.confirm)
      .mockResolvedValueOnce(false)   // Codex
      .mockResolvedValueOnce(false)   // Gemini
    vi.mocked(output.select)
      .mockResolvedValueOnce('library')  // projectType

    const result = await askWizardQuestions({
      output,
      suggestion: 'deep',
      methodology: 'deep',
      auto: false,
      traits: ['web', 'mobile'],
    })

    expect(result.traits).toEqual(['web', 'mobile'])
    // confirm called only twice (Codex + Gemini), not four times
    expect(output.confirm).toHaveBeenCalledTimes(2)
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
      .mockResolvedValueOnce(false)   // Gemini
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
      engine: 'unreal',
    })

    expect(result.gameConfig!.engine).toBe('unreal')
    // select called 3 times (multiplayer, contentStructure, economy) — engine was skipped
    expect(output.select).toHaveBeenCalledTimes(3)
    // First select call should be multiplayer, NOT engine
    expect(output.select).toHaveBeenNthCalledWith(1, 'Multiplayer mode:', ['none', 'local', 'online', 'hybrid'], 'none')
  })

  it('--multiplayer flag is used', async () => {
    const output = makeOutputContext()

    const result = await askWizardQuestions({
      output,
      suggestion: 'deep',
      methodology: 'deep',
      auto: true,
      projectType: 'game',
      multiplayer: 'online',
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
      targetPlatforms: ['pc', 'ps5', 'xbox'],
    })

    expect(result.gameConfig!.targetPlatforms).toEqual(['pc', 'ps5', 'xbox'])
    expect(output.multiSelect).not.toHaveBeenCalled()
  })

  it('advanced flag (--narrative) forces advanced gate open and asks remaining questions', async () => {
    const output = makeOutputContext()
    vi.mocked(output.confirm)
      .mockResolvedValueOnce(false)   // Codex
      .mockResolvedValueOnce(false)   // Gemini
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
      narrative: 'heavy',
    })

    // The flagged value should be used directly
    expect(result.gameConfig!.narrative).toBe('heavy')
    // The remaining advanced questions should have been asked interactively
    expect(result.gameConfig!.supportedLocales).toEqual(['en', 'ja'])
    expect(result.gameConfig!.npcAiComplexity).toBe('complex')
    expect(result.gameConfig!.hasModding).toBe(true)
    expect(result.gameConfig!.persistence).toBe('cloud')
    // confirm should NOT have been called for the advanced gate
    // Total confirms: Codex, Gemini, web, mobile, modding = 5
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
