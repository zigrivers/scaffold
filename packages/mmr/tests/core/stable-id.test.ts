import { describe, it, expect } from 'vitest'
import {
  computeFindingKey,
  descriptionShingle,
  jaccardSimilarity,
  normalizeDescriptionForKey,
  normalizeLocationForKey,
  normalizeSuggestionForKey,
} from '../../src/core/stable-id.js'
import type { Finding } from '../../src/types.js'

describe('normalizeLocationForKey', () => {
  it('lowercases and trims', () => {
    expect(normalizeLocationForKey('  Src/Foo.TS  ')).toBe('src/foo.ts')
  })

  it('strips trailing :N', () => {
    expect(normalizeLocationForKey('src/foo.ts:42')).toBe('src/foo.ts')
  })

  it('strips trailing :N-M (line range)', () => {
    expect(normalizeLocationForKey('pkg/Bar.kt:10-12')).toBe('pkg/bar.kt')
  })

  it('strips trailing :N:M (line:col)', () => {
    expect(normalizeLocationForKey('src/foo.ts:42:7')).toBe('src/foo.ts')
  })

  it('strips trailing (line N)', () => {
    expect(normalizeLocationForKey('src/foo.ts (line 42)')).toBe('src/foo.ts')
  })

  it('does NOT eat mid-path digits', () => {
    // "Section 2: T2-B" is a heading-style location — T2-B is not all digits,
    // so the anchored regex must not strip it.
    expect(normalizeLocationForKey('Section 2: T2-B')).toBe('section 2: t2-b')
  })

  it('preserves a path with no line span', () => {
    expect(normalizeLocationForKey('src/foo.ts')).toBe('src/foo.ts')
  })
})

describe('normalizeDescriptionForKey', () => {
  it('lowercases and collapses whitespace in non-code segments', () => {
    expect(normalizeDescriptionForKey('Variable   foo  Is    Unused')).toBe('variable foo is unused')
  })

  it('preserves case inside backtick code spans', () => {
    expect(normalizeDescriptionForKey('Variable `fooBar` is unused')).toBe('variable `fooBar` is unused')
  })

  it('preserves whitespace inside backtick code spans', () => {
    const doubleSpace = normalizeDescriptionForKey('Value `foo  bar` differs')
    const singleSpace = normalizeDescriptionForKey('Value `foo bar` differs')
    expect(doubleSpace).toBe('value `foo  bar` differs')
    expect(singleSpace).toBe('value `foo bar` differs')
    expect(doubleSpace).not.toBe(singleSpace)
  })

  it('does not add spaces around adjacent code spans', () => {
    expect(normalizeDescriptionForKey('Type`T`')).toBe('type`T`')
  })

  it('distinguishes case-sensitive identifiers across two descriptions', () => {
    const a = normalizeDescriptionForKey('`fooBar` is unused')
    const b = normalizeDescriptionForKey('`FooBar` is unused')
    expect(a).not.toBe(b)
  })

  it('strips line-number mentions like "line 42"', () => {
    expect(normalizeDescriptionForKey('Bug at line 42 here')).toBe('bug here')
  })

  it('normalizes "at line N" like equivalent "at N" location references', () => {
    const withLine = normalizeDescriptionForKey('Bug found at line 42 in code')
    const withoutLine = normalizeDescriptionForKey('Bug found at 42 in code')
    expect(withLine).toBe('bug found in code')
    expect(withLine).toBe(withoutLine)
  })

  it('strips "at 42" mentions', () => {
    expect(normalizeDescriptionForKey('Bug found at 42 in code')).toBe('bug found in code')
  })

  it('strips "at N" mentions before sentence punctuation', () => {
    expect(normalizeDescriptionForKey('Bug found at 42.')).toBe('bug found')
    expect(normalizeDescriptionForKey('Bug found at 43.')).toBe('bug found')
  })

  it('preserves meaningful numeric phrases after "at"', () => {
    const thirty = normalizeDescriptionForKey('Timeout at 30 seconds')
    const sixty = normalizeDescriptionForKey('Timeout at 60 seconds')
    expect(thirty).toBe('timeout at 30 seconds')
    expect(sixty).toBe('timeout at 60 seconds')
    expect(thirty).not.toBe(sixty)
    expect(normalizeDescriptionForKey('Buffer at 64 bytes')).toBe('buffer at 64 bytes')
    expect(normalizeDescriptionForKey('Width at 10 pixels')).toBe('width at 10 pixels')
  })

  it('preserves decimal numeric phrases after "at"', () => {
    expect(normalizeDescriptionForKey('Threshold at 0.5 is too low')).toBe('threshold at 0.5 is too low')
  })

  it('preserves bare numeric values after "at" by default', () => {
    const status404 = normalizeDescriptionForKey('Status at 404 is expected')
    const status500 = normalizeDescriptionForKey('Status at 500 is expected')
    expect(status404).toBe('status at 404 is expected')
    expect(status500).toBe('status at 500 is expected')
    expect(status404).not.toBe(status500)
    expect(normalizeDescriptionForKey('Port at 3000 is unavailable')).toBe('port at 3000 is unavailable')
    expect(normalizeDescriptionForKey('Index at 0 is skipped')).toBe('index at 0 is skipped')
    expect(normalizeDescriptionForKey('Version at 2 fails')).toBe('version at 2 fails')
  })

  it('strips severity-prefix filler', () => {
    expect(normalizeDescriptionForKey('P0: critical bug')).toBe('critical bug')
    expect(normalizeDescriptionForKey('Critical: real issue')).toBe('real issue')
  })

  it('handles unmatched backticks as literal text', () => {
    // Lone backtick: the split yields ['Lone ', 'tick here'] - odd index would be
    // treated as code-span; since there is no closing backtick the implementation
    // should be defensive. Verify it does not throw and produces a deterministic value.
    expect(normalizeDescriptionForKey('Lone `tick here')).toBe('lone `tick here')
    expect(normalizeDescriptionForKey('Unused `Foo')).toBe(normalizeDescriptionForKey('Unused `foo'))
  })

  it('handles empty input', () => {
    expect(normalizeDescriptionForKey('')).toBe('')
  })
})

describe('normalizeSuggestionForKey', () => {
  it('lowercases prose and collapses whitespace', () => {
    expect(normalizeSuggestionForKey('  Use   Const   instead  ')).toBe('use const instead')
    expect(normalizeSuggestionForKey('Fix it')).toBe(normalizeSuggestionForKey('fix it'))
  })

  it('preserves punctuation and code-like tokens', () => {
    expect(normalizeSuggestionForKey('Rename foo to bar.')).toBe('rename foo to bar.')
    expect(normalizeSuggestionForKey('Rename `FooBar` to `fooBar`.')).toBe('rename `FooBar` to `fooBar`.')
    expect(normalizeSuggestionForKey('Rename FooBar to fooBar.')).not.toBe(
      normalizeSuggestionForKey('Rename foobar to foobar.'),
    )
    expect(normalizeSuggestionForKey('Rename HTTPServer to URLParser.')).not.toBe(
      normalizeSuggestionForKey('Rename httpserver to urlparser.'),
    )
    expect(normalizeSuggestionForKey('Replace MAX_RETRIES.')).not.toBe(
      normalizeSuggestionForKey('Replace max_retries.'),
    )
  })

  it('does not strip description-only noise patterns', () => {
    expect(normalizeSuggestionForKey('P1: update line 42.')).toBe('p1: update line 42.')
    expect(normalizeSuggestionForKey('Use port at 3000.')).toBe('use port at 3000.')
  })

  it('handles empty input', () => {
    expect(normalizeSuggestionForKey('')).toBe('')
  })
})

describe('computeFindingKey', () => {
  it('produces a 40-char sha1 hex string', () => {
    const f: Finding = {
      severity: 'P1',
      location: 'src/foo.ts:42',
      description: 'bug',
      suggestion: 'fix it',
    }
    const key = computeFindingKey(f)
    expect(key).toMatch(/^[a-f0-9]{40}$/)
  })

  it('produces the same key for two findings whose only difference is line number', () => {
    const a: Finding = { severity: 'P1', location: 'src/foo.ts:42', description: 'bug', suggestion: 'fix' }
    const b: Finding = { severity: 'P1', location: 'src/foo.ts:99', description: 'bug', suggestion: 'fix' }
    expect(computeFindingKey(a)).toBe(computeFindingKey(b))
  })

  it('produces the same key for two findings whose only difference is severity', () => {
    const a: Finding = { severity: 'P0', location: 'src/foo.ts:42', description: 'bug', suggestion: 'fix' }
    const b: Finding = { severity: 'P2', location: 'src/foo.ts:42', description: 'bug', suggestion: 'fix' }
    expect(computeFindingKey(a)).toBe(computeFindingKey(b))
  })

  it('produces DIFFERENT keys for same-file findings with different code identifiers', () => {
    // This is the load-bearing T2-A collision-avoidance case.
    const a: Finding = {
      severity: 'P2',
      location: 'src/foo.ts:42',
      description: 'Variable `fooBar` is unused',
      suggestion: 'remove `fooBar`',
    }
    const b: Finding = {
      severity: 'P2',
      location: 'src/foo.ts:42',
      description: 'Variable `bazQux` is unused',
      suggestion: 'remove `bazQux`',
    }
    expect(computeFindingKey(a)).not.toBe(computeFindingKey(b))
  })

  it('produces DIFFERENT keys when only suggestion differs', () => {
    const a: Finding = { severity: 'P2', location: 'src/foo.ts:42', description: 'bug', suggestion: 'rename to a' }
    const b: Finding = { severity: 'P2', location: 'src/foo.ts:42', description: 'bug', suggestion: 'rename to b' }
    expect(computeFindingKey(a)).not.toBe(computeFindingKey(b))
  })

  it('produces DIFFERENT keys when only category differs', () => {
    const a: Finding = { category: 'security', severity: 'P2', location: 'src/foo.ts:42', description: 'bug', suggestion: 'fix' }
    const b: Finding = { category: 'style', severity: 'P2', location: 'src/foo.ts:42', description: 'bug', suggestion: 'fix' }
    expect(computeFindingKey(a)).not.toBe(computeFindingKey(b))
  })

  it('normalizes category casing', () => {
    const a: Finding = { category: 'Security', severity: 'P2', location: 'src/foo.ts:42', description: 'bug', suggestion: 'fix' }
    const b: Finding = { category: 'security', severity: 'P2', location: 'src/foo.ts:42', description: 'bug', suggestion: 'fix' }
    expect(computeFindingKey(a)).toBe(computeFindingKey(b))
  })

  it('escapes separators in location and category key parts', () => {
    const a: Finding = { category: 'b|c', severity: 'P2', location: 'a', description: 'bug', suggestion: 'fix' }
    const b: Finding = { category: 'c', severity: 'P2', location: 'a|b', description: 'bug', suggestion: 'fix' }
    expect(computeFindingKey(a)).not.toBe(computeFindingKey(b))
  })

  it('treats missing category as the same as empty-string category for keying', () => {
    const a: Finding = { severity: 'P2', location: 'src/foo.ts:42', description: 'bug', suggestion: 'fix' }
    const b: Finding = { category: '', severity: 'P2', location: 'src/foo.ts:42', description: 'bug', suggestion: 'fix' }
    expect(computeFindingKey(a)).toBe(computeFindingKey(b))
  })
})

describe('descriptionShingle', () => {
  it('returns char-5-grams from a normalized description', () => {
    const shingle = descriptionShingle('hello world')
    expect(shingle).toContain('hello')
    expect(shingle).toContain('ello ')
    expect(shingle).toContain('llo w')
    expect(shingle).toContain('lo wo')
    expect(shingle).toContain('o wor')
    expect(shingle).toContain(' worl')
    expect(shingle).toContain('world')
  })

  it('deduplicates repeated grams', () => {
    const shingle = descriptionShingle('aaaaaaa')
    expect(shingle).toEqual(['aaaaa'])
  })

  it('returns empty array for strings shorter than 5 chars', () => {
    expect(descriptionShingle('abc')).toEqual([])
  })

  it('applies short-string cutoff before modal normalization', () => {
    expect(descriptionShingle('must')).toEqual([])
  })

  it('returns single gram for strings exactly 5 chars', () => {
    expect(descriptionShingle('abcde')).toEqual(['abcde'])
  })

  it('normalizes descriptions before shingling', () => {
    expect(descriptionShingle('Bug at line 42 here')).toEqual(descriptionShingle('bug here'))
  })

  it('does not normalize modal words inside code spans', () => {
    expect(descriptionShingle('`must` is unused')).not.toEqual(descriptionShingle('`should` is unused'))
  })
})

describe('jaccardSimilarity', () => {
  it('returns 1 for identical sets', () => {
    expect(jaccardSimilarity(['abc', 'def'], ['def', 'abc'])).toBe(1)
  })

  it('returns 0 for disjoint sets', () => {
    expect(jaccardSimilarity(['abc'], ['def'])).toBe(0)
  })

  it('returns intersection over union', () => {
    expect(jaccardSimilarity(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3)
  })

  it('returns 1 for two empty sets', () => {
    expect(jaccardSimilarity([], [])).toBe(1)
  })

  it('crosses the 0.7 threshold for near-identical phrasings', () => {
    const a = descriptionShingle('unused variable named fooBar should be removed')
    const b = descriptionShingle('unused variable named fooBar must be removed')
    expect(jaccardSimilarity(a, b)).toBeGreaterThanOrEqual(0.7)
  })

  it('treats unmatched backticks as prose for modal normalization', () => {
    expect(descriptionShingle('unused `value should be removed')).toEqual(
      descriptionShingle('unused `value must be removed'),
    )
  })
})
