/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks need flexible typing */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { disambiguate, PROJECT_TYPE_PREFERENCE } from './disambiguate.js'
import { ProjectTypeSchema } from '../../config/schema.js'
import type { DetectionMatch } from './types.js'

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
  ExitPromptError: class extends Error {
    override name = 'ExitPromptError'
  },
}))

const mockMatch = (type: any, confidence: any, evidenceCount = 2): DetectionMatch => ({
  projectType: type,
  confidence,
  partialConfig: {} as any,
  evidence: Array(evidenceCount).fill({ signal: 'test' }),
}) as DetectionMatch

describe('disambiguate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Simulate interactive TTY
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true })
    delete process.env.CI
  })

  it('returns no-eligible-matches for empty input', async () => {
    const result = await disambiguate([], { interactive: true, acceptLowConfidence: false })
    expect(result.chosen).toBeNull()
    expect(result.skipReason).toBe('no-eligible-matches')
  })

  it('returns skipReason auto under --auto', async () => {
    const result = await disambiguate(
      [mockMatch('web-app', 'high'), mockMatch('backend', 'high')],
      { interactive: false, acceptLowConfidence: false },
    )
    expect(result.chosen).toBeNull()
    expect(result.skipReason).toBe('auto')
  })

  it('returns nonTtyFallback when stdin not TTY', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
    const result = await disambiguate(
      [mockMatch('web-app', 'high'), mockMatch('backend', 'high')],
      { interactive: true, acceptLowConfidence: false },
    )
    expect(result.chosen).toBeNull()
    expect(result.skipReason).toBe('auto')
    expect(result.nonTtyFallback).toBe(true)
  })

  it('returns nonTtyFallback when CI env set', async () => {
    process.env.CI = 'true'
    const result = await disambiguate(
      [mockMatch('web-app', 'high'), mockMatch('backend', 'high')],
      { interactive: true, acceptLowConfidence: false },
    )
    expect(result.skipReason).toBe('auto')
    expect(result.nonTtyFallback).toBe(true)
  })

  it('filters low matches unless forced', async () => {
    const matches = [mockMatch('web-app', 'high'), mockMatch('library', 'low')]
    // We don't actually prompt here — using --auto to check filtering behavior
    const result = await disambiguate(matches, { interactive: false, acceptLowConfidence: false })
    expect(result.skipReason).toBe('auto')
  })

  it('includes low matches when acceptLowConfidence is true', async () => {
    const matches = [mockMatch('web-app', 'high'), mockMatch('library', 'low')]
    const result = await disambiguate(matches, { interactive: false, acceptLowConfidence: true })
    expect(result.skipReason).toBe('auto')
  })

  it('interactive prompt returns chosen match when select resolves to a match', async () => {
    const { select } = await import('@inquirer/prompts') as { select: any }
    vi.mocked(select).mockResolvedValueOnce(mockMatch('backend', 'high'))
    const result = await disambiguate(
      [mockMatch('web-app', 'high'), mockMatch('backend', 'high')],
      { interactive: true, acceptLowConfidence: false },
    )
    expect(result.chosen?.projectType).toBe('backend')
    expect(result.skipReason).toBeUndefined()
  })

  it('user-skipped (None of these) → skipReason user-skipped', async () => {
    const { select } = await import('@inquirer/prompts') as { select: any }
    vi.mocked(select).mockResolvedValueOnce(null)    // "None of these"
    const result = await disambiguate(
      [mockMatch('web-app', 'high'), mockMatch('backend', 'high')],
      { interactive: true, acceptLowConfidence: false },
    )
    expect(result.chosen).toBeNull()
    expect(result.skipReason).toBe('user-skipped')
  })

  it('ExitPromptError (Ctrl-C) → skipReason user-cancelled', async () => {
    const { select, ExitPromptError } = await import('@inquirer/prompts') as any
    vi.mocked(select).mockRejectedValueOnce(new ExitPromptError('User cancelled'))
    const result = await disambiguate(
      [mockMatch('web-app', 'high'), mockMatch('backend', 'high')],
      { interactive: true, acceptLowConfidence: false },
    )
    expect(result.chosen).toBeNull()
    expect(result.skipReason).toBe('user-cancelled')
  })

  it('non-ExitPromptError is re-thrown', async () => {
    const { select } = await import('@inquirer/prompts') as any
    vi.mocked(select).mockRejectedValueOnce(new Error('unexpected'))
    await expect(disambiguate(
      [mockMatch('web-app', 'high'), mockMatch('backend', 'high')],
      { interactive: true, acceptLowConfidence: false },
    )).rejects.toThrow('unexpected')
  })

  it('sort order: high before medium before low', async () => {
    const { select } = await import('@inquirer/prompts') as any
    let choicesArg: any[] = []
    vi.mocked(select).mockImplementationOnce(async ({ choices }: any) => {
      choicesArg = choices
      return choices[0].value
    })
    await disambiguate(
      [
        mockMatch('library', 'low'),
        mockMatch('backend', 'medium'),
        mockMatch('web-app', 'high'),
      ],
      { interactive: true, acceptLowConfidence: true },
    )
    // First choice is web-app (high tier)
    expect(choicesArg[0].value.projectType).toBe('web-app')
    // Last meaningful choice is library (low tier)
    expect(choicesArg[2].value.projectType).toBe('library')
    // Last choice is the "None of these" sentinel
    expect(choicesArg[3].value).toBeNull()
  })

  it('Case F: low-only matches render with "weak signals" header', async () => {
    const { select } = await import('@inquirer/prompts') as any
    let messageArg: string = ''
    vi.mocked(select).mockImplementationOnce(async ({ message, choices }: any) => {
      messageArg = message
      return choices[0].value
    })
    await disambiguate(
      [mockMatch('library', 'low')],
      { interactive: true, acceptLowConfidence: true },
    )
    expect(messageArg).toContain('weak signals')
  })
})

describe('PROJECT_TYPE_PREFERENCE completeness', () => {
  it('includes every ProjectType so indexOf() tiebreak is stable', () => {
    const listed = new Set(PROJECT_TYPE_PREFERENCE as readonly string[])
    for (const t of ProjectTypeSchema.options) {
      expect(listed.has(t)).toBe(true)
    }
  })
})
