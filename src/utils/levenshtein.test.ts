import { describe, it, expect } from 'vitest'
import { levenshteinDistance, findClosestMatch } from './levenshtein.js'

describe('levenshteinDistance', () => {
  it('returns 1 for \'deap\' vs \'deep\'', () => {
    expect(levenshteinDistance('deap', 'deep')).toBe(1)
  })

  it('returns 1 for \'clasic\' vs \'classic\'', () => {
    expect(levenshteinDistance('clasic', 'classic')).toBe(1)
  })

  it('returns 0 for two empty strings', () => {
    expect(levenshteinDistance('', '')).toBe(0)
  })

  it('returns 3 for \'abc\' vs \'\'', () => {
    expect(levenshteinDistance('abc', '')).toBe(3)
  })

  it('returns 3 for \'\' vs \'abc\'', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3)
  })

  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('same', 'same')).toBe(0)
  })
})

describe('findClosestMatch', () => {
  it('finds \'deep\' from candidates within distance 2', () => {
    expect(findClosestMatch('deap', ['deep', 'mvp', 'custom'], 2)).toBe('deep')
  })

  it('returns null when no candidate is within maxDistance', () => {
    expect(findClosestMatch('xyz', ['deep', 'mvp', 'custom'], 2)).toBe(null)
  })

  it('finds \'classic\' from candidates within distance 2', () => {
    expect(findClosestMatch('clasic', ['classic', 'custom'], 2)).toBe('classic')
  })
})
