import { describe, it, expect } from 'vitest'
import { coerceCSV } from './coerce.js'

describe('coerceCSV', () => {
  it('splits a single CSV string', () => {
    expect(coerceCSV('a,b,c')).toEqual(['a', 'b', 'c'])
  })

  it('handles repeated flag arrays', () => {
    expect(coerceCSV(['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('combines CSV and repeated flags', () => {
    expect(coerceCSV(['a,b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('deduplicates values', () => {
    expect(coerceCSV(['a', 'b', 'a'])).toEqual(['a', 'b'])
  })

  it('trims whitespace', () => {
    expect(coerceCSV('a, b, c')).toEqual(['a', 'b', 'c'])
  })

  it('filters empty strings', () => {
    expect(coerceCSV('a,,b,')).toEqual(['a', 'b'])
  })

  it('handles a single value without commas', () => {
    expect(coerceCSV('hello')).toEqual(['hello'])
  })

  it('returns empty array for empty string', () => {
    expect(coerceCSV('')).toEqual([])
  })
})
