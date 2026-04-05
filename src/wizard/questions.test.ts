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

  it('auto mode returns defaults without projectType or gameConfig', async () => {
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
})
