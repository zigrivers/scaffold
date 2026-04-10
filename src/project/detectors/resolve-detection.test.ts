/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks need flexible typing */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveDetection, synthesizeEmptyMatch } from './resolve-detection.js'
import type { DetectionMatch } from './types.js'

vi.mock('./disambiguate.js', () => ({
  disambiguate: vi.fn(),
}))
import { disambiguate } from './disambiguate.js'

const match = (t: any, c: any): DetectionMatch => ({
  projectType: t, confidence: c, partialConfig: {} as any, evidence: [],
}) as DetectionMatch

describe('resolveDetection Cases A-G', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  it('Case A: no matches → no projectType', async () => {
    const result = await resolveDetection({
      matches: [],
      opts: { interactive: true, acceptLowConfidence: false },
    })
    expect(result.chosen).toBeNull()
    expect(result.error).toBeUndefined()
  })

  it('Case B: single high → commit', async () => {
    const m = match('web-app', 'high')
    const result = await resolveDetection({
      matches: [m],
      opts: { interactive: true, acceptLowConfidence: false },
    })
    expect(result.chosen).toBe(m)
  })

  it('Case B with runners-up: warns ADOPT_SECONDARY_MATCHES', async () => {
    const result = await resolveDetection({
      matches: [match('web-app', 'high'), match('backend', 'medium')],
      opts: { interactive: true, acceptLowConfidence: false },
    })
    expect(result.chosen?.projectType).toBe('web-app')
    expect(result.warnings.some(w => w.code === 'ADOPT_SECONDARY_MATCHES')).toBe(true)
  })

  it('Case C: multiple high → disambiguate is called', async () => {
    vi.mocked(disambiguate).mockResolvedValueOnce({ chosen: match('backend', 'high') })
    const result = await resolveDetection({
      matches: [match('web-app', 'high'), match('backend', 'high')],
      opts: { interactive: true, acceptLowConfidence: false },
    })
    expect(disambiguate).toHaveBeenCalled()
    expect(result.chosen?.projectType).toBe('backend')
  })

  it('Case C under --auto: emits ADOPT_AMBIGUOUS error', async () => {
    vi.mocked(disambiguate).mockResolvedValueOnce({ chosen: null, skipReason: 'auto' })
    const result = await resolveDetection({
      matches: [match('web-app', 'high'), match('backend', 'high')],
      opts: { interactive: false, acceptLowConfidence: false },
    })
    expect(result.chosen).toBeNull()
    expect(result.error?.code).toBe('ADOPT_AMBIGUOUS')
    expect(result.error?.exitCode).toBe(6)
  })

  it('Case D: single medium → commit', async () => {
    const m = match('library', 'medium')
    const result = await resolveDetection({
      matches: [m],
      opts: { interactive: true, acceptLowConfidence: false },
    })
    expect(result.chosen).toBe(m)
  })

  it('Case F: only low interactive → delegates to disambiguate', async () => {
    vi.mocked(disambiguate).mockResolvedValueOnce({ chosen: match('library', 'low') })
    const result = await resolveDetection({
      matches: [match('library', 'low')],
      opts: { interactive: true, acceptLowConfidence: false },
    })
    expect(result.chosen?.projectType).toBe('library')
  })

  it('Case F: only low --auto → ADOPT_LOW_ONLY warning + no commit', async () => {
    vi.mocked(disambiguate).mockResolvedValueOnce({ chosen: null, skipReason: 'auto' })
    const result = await resolveDetection({
      matches: [match('library', 'low')],
      opts: { interactive: false, acceptLowConfidence: false },
    })
    expect(result.chosen).toBeNull()
    expect(result.warnings.some(w => w.code === 'ADOPT_LOW_ONLY')).toBe(true)
  })

  it('Case G: explicitProjectType short-circuits detection', async () => {
    const result = await resolveDetection({
      matches: [match('backend', 'high')],    // Would otherwise pick backend
      explicitProjectType: 'web-app',          // But user said web-app
      opts: { interactive: true, acceptLowConfidence: false },
    })
    expect(result.chosen?.projectType).toBe('web-app')
    expect(disambiguate).not.toHaveBeenCalled()
  })

  it('Case G: explicitProjectType promotes detected match instead of synthesizing empty', async () => {
    const webMatch = match('web-app', 'medium')
    // Manually add partialConfig for realism
    const richMatch = { ...webMatch, partialConfig: { renderingStrategy: 'ssr' } } as DetectionMatch
    const result = await resolveDetection({
      matches: [richMatch, match('backend', 'high')],
      explicitProjectType: 'web-app',
      opts: { interactive: true, acceptLowConfidence: false },
    })
    expect(result.chosen?.projectType).toBe('web-app')
    expect(result.chosen?.confidence).toBe('high')   // promoted
    expect((result.chosen?.partialConfig as any)?.renderingStrategy).toBe('ssr')  // preserved
    expect(result.chosen?.evidence).toContainEqual(
      expect.objectContaining({ signal: 'user-specified' }),
    )
    expect(disambiguate).not.toHaveBeenCalled()
  })

  it('Case C user-cancelled → ADOPT_USER_CANCELLED error with exit code 4', async () => {
    vi.mocked(disambiguate).mockResolvedValueOnce({ chosen: null, skipReason: 'user-cancelled' })
    const result = await resolveDetection({
      matches: [match('web-app', 'high'), match('backend', 'high')],
      opts: { interactive: true, acceptLowConfidence: false },
    })
    expect(result.error?.code).toBe('ADOPT_USER_CANCELLED')
    expect(result.error?.exitCode).toBe(4)
  })

  it('Case C non-TTY fallback → ADOPT_NON_TTY warning + ADOPT_AMBIGUOUS error', async () => {
    vi.mocked(disambiguate).mockResolvedValueOnce({ chosen: null, skipReason: 'auto', nonTtyFallback: true })
    const result = await resolveDetection({
      matches: [match('web-app', 'high'), match('backend', 'high')],
      opts: { interactive: true, acceptLowConfidence: false },
    })
    expect(result.warnings.some(w => w.code === 'ADOPT_NON_TTY')).toBe(true)
    expect(result.error?.code).toBe('ADOPT_AMBIGUOUS')
  })

  it('Case E: multiple medium matches → disambiguate called', async () => {
    vi.mocked(disambiguate).mockResolvedValueOnce({ chosen: match('library', 'medium') })
    const result = await resolveDetection({
      matches: [match('library', 'medium'), match('cli', 'medium')],
      opts: { interactive: true, acceptLowConfidence: false },
    })
    expect(disambiguate).toHaveBeenCalled()
    expect(result.chosen?.projectType).toBe('library')
  })

  it('Case B with low runner-up: warns ADOPT_SECONDARY_MATCHES', async () => {
    const result = await resolveDetection({
      matches: [match('web-app', 'high'), match('library', 'low')],
      opts: { interactive: true, acceptLowConfidence: false },
    })
    expect(result.chosen?.projectType).toBe('web-app')
    expect(result.warnings.some(w => w.code === 'ADOPT_SECONDARY_MATCHES')).toBe(true)
  })

  it('Case D with low runner-up: warns ADOPT_SECONDARY_MATCHES', async () => {
    const result = await resolveDetection({
      matches: [match('backend', 'medium'), match('library', 'low')],
      opts: { interactive: true, acceptLowConfidence: false },
    })
    expect(result.chosen?.projectType).toBe('backend')
    expect(result.warnings.some(w => w.code === 'ADOPT_SECONDARY_MATCHES')).toBe(true)
  })

  it('synthesizeEmptyMatch produces a match with empty partialConfig', () => {
    const m = synthesizeEmptyMatch('web-app')
    expect(m.projectType).toBe('web-app')
    expect(m.confidence).toBe('high')
    expect(Object.keys(m.partialConfig as object)).toHaveLength(0)
    expect(m.evidence[0].signal).toBe('user-specified')
  })
})
