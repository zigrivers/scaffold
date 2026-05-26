import { describe, it, expect } from 'vitest'
import { normalizeLocationForKey } from '../../src/core/stable-id.js'

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
