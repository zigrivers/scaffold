import { describe, expect, it } from 'vitest'
import { lensPreamble, assignLenses } from '../../src/core/critique-lenses.js'

describe('lensPreamble', () => {
  it('returns the built-in description for a known lens', () => {
    expect(lensPreamble('skeptic').toLowerCase()).toMatch(/skeptic|risk|flaw/)
  })
  it('is case-insensitive', () => {
    expect(lensPreamble('Skeptic')).toBe(lensPreamble('skeptic'))
  })
  it('falls back to a generic preamble naming an unknown lens', () => {
    expect(lensPreamble('astrologer')).toContain('astrologer')
  })
})

describe('assignLenses', () => {
  it('cycles lenses across channels', () => {
    expect(assignLenses(['a', 'b'], 3)).toEqual(['a', 'b', 'a'])
  })
  it('returns [] when there are no lenses', () => {
    expect(assignLenses([], 3)).toEqual([])
  })
})
