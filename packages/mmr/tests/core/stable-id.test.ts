import { describe, it, expect } from 'vitest'
import {
  normalizeDescriptionForKey,
  normalizeLocationForKey,
} from '../../src/core/stable-id.js'

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

  it('does not add spaces around adjacent code spans', () => {
    expect(normalizeDescriptionForKey('Type`T`')).toBe('type`T`')
  })

  it('distinguishes case-sensitive identifiers across two descriptions', () => {
    const a = normalizeDescriptionForKey('`fooBar` is unused')
    const b = normalizeDescriptionForKey('`FooBar` is unused')
    expect(a).not.toBe(b)
  })

  it('strips line-number mentions like "line 42"', () => {
    expect(normalizeDescriptionForKey('Bug at line 42 here')).toBe('bug at here')
  })

  it('strips "at 42" mentions', () => {
    expect(normalizeDescriptionForKey('Bug found at 42 in code')).toBe('bug found in code')
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
