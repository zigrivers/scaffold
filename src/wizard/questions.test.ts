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
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)

    const result = await askWizardQuestions({
      output,
      suggestion: 'deep',
      methodology: 'deep',
      auto: false,
    })

    expect(result.platforms).toEqual(['claude-code', 'gemini'])
  })
})
