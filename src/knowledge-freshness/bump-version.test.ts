import { describe, it, expect } from 'vitest'
import { deriveBumpKind, bumpSemver } from './bump-version.js'

describe('deriveBumpKind', () => {
  it('returns major when BREAKING CHANGE appears in title', () => {
    expect(
      deriveBumpKind('feat(knowledge): rework API BREAKING CHANGE: drops X', ''),
    ).toBe('major')
  })

  it('returns major when BREAKING CHANGE appears at the start of a body line', () => {
    expect(
      deriveBumpKind('feat(knowledge): new entry', 'Body line\nBREAKING CHANGE: removes Y'),
    ).toBe('major')
  })

  it('does NOT return major when BREAKING CHANGE appears mid-line (round-2 F-002)', () => {
    // A freshness PR body's findings table can quote evidence containing the
    // string "BREAKING CHANGE:" inside a cell. That must NOT trigger major.
    const body = '| P1 | citation: "see the BREAKING CHANGE: removed-deprecated section above" |'
    expect(deriveBumpKind('chore(knowledge): refresh X', body)).toBe('patch')
  })

  it('does NOT return major when BREAKING CHANGE is preceded by whitespace or > (quoted)', () => {
    expect(deriveBumpKind('chore(knowledge): X', '> BREAKING CHANGE: from external doc')).toBe('patch')
    expect(deriveBumpKind('chore(knowledge): X', '  BREAKING CHANGE: indented')).toBe('patch')
  })

  it('returns minor for feat(knowledge): prefix', () => {
    expect(deriveBumpKind('feat(knowledge): add new entry for Z', '')).toBe('minor')
  })

  it('returns minor for feat(knowledge-freshness): prefix', () => {
    expect(deriveBumpKind('feat(knowledge-freshness): new workflow', '')).toBe('minor')
  })

  it('returns patch for chore(knowledge): prefix', () => {
    expect(deriveBumpKind('chore(knowledge): refresh React entry against v19', '')).toBe('patch')
  })

  it('returns patch for chore(knowledge-freshness): prefix', () => {
    expect(deriveBumpKind('chore(knowledge-freshness): tweak cadence', '')).toBe('patch')
  })

  it('defaults to patch for unrecognized prefixes', () => {
    expect(deriveBumpKind('docs: tweak README', '')).toBe('patch')
    expect(deriveBumpKind('fix: nit', '')).toBe('patch')
    expect(deriveBumpKind('', '')).toBe('patch')
  })
})

describe('bumpSemver', () => {
  it('bumps patch', () => {
    expect(bumpSemver('0.1.0', 'patch')).toBe('0.1.1')
    expect(bumpSemver('1.2.3', 'patch')).toBe('1.2.4')
  })

  it('bumps minor and resets patch', () => {
    expect(bumpSemver('0.1.5', 'minor')).toBe('0.2.0')
    expect(bumpSemver('1.2.3', 'minor')).toBe('1.3.0')
  })

  it('bumps major and resets minor and patch', () => {
    expect(bumpSemver('0.1.5', 'major')).toBe('1.0.0')
    expect(bumpSemver('2.4.7', 'major')).toBe('3.0.0')
  })

  it('tolerates trailing newline / whitespace from a VERSION file', () => {
    expect(bumpSemver('0.1.0\n', 'patch')).toBe('0.1.1')
    expect(bumpSemver('  1.0.0  ', 'minor')).toBe('1.1.0')
  })

  it('throws on invalid SemVer input', () => {
    expect(() => bumpSemver('1.0', 'patch')).toThrow(/invalid SemVer/)
    expect(() => bumpSemver('1.0.0-beta', 'patch')).toThrow(/invalid SemVer/)
    expect(() => bumpSemver('vNotASemver', 'patch')).toThrow(/invalid SemVer/)
    expect(() => bumpSemver('', 'patch')).toThrow(/invalid SemVer/)
  })

  it('catches up patch by count (rapid batch where intermediate bump runs were cancelled)', () => {
    expect(bumpSemver('0.1.14', 'patch', 9)).toBe('0.1.23')
    expect(bumpSemver('1.2.3', 'patch', 1)).toBe('1.2.4')
    expect(bumpSemver('0.1.0', 'patch', 4)).toBe('0.1.4')
  })

  it('ignores count for minor and major (reset semantics make a multiplier meaningless)', () => {
    expect(bumpSemver('0.1.5', 'minor', 9)).toBe('0.2.0')
    expect(bumpSemver('0.1.5', 'major', 9)).toBe('1.0.0')
  })

  it('does NOT throw on an invalid count for minor/major (count is unused there)', () => {
    expect(bumpSemver('0.1.5', 'minor', 0)).toBe('0.2.0')
    expect(bumpSemver('0.1.5', 'major', Number.NaN)).toBe('1.0.0')
  })

  it('rejects a non-positive or non-integer count for PATCH bumps', () => {
    expect(() => bumpSemver('0.1.0', 'patch', 0)).toThrow(/count must be a positive integer/)
    expect(() => bumpSemver('0.1.0', 'patch', -3)).toThrow(/count must be a positive integer/)
    expect(() => bumpSemver('0.1.0', 'patch', 1.5)).toThrow(/count must be a positive integer/)
  })
})

describe('end-to-end fixture: simulated merged PR title → version diff', () => {
  it('chore(knowledge) PR bumps patch', () => {
    const title = 'chore(knowledge): refresh React entry against v19'
    const body = ''
    const kind = deriveBumpKind(title, body)
    expect(bumpSemver('0.1.0', kind)).toBe('0.1.1')
  })

  it('feat(knowledge-freshness) PR bumps minor', () => {
    const title = 'feat(knowledge-freshness): add Postgres entry'
    const body = 'New entry'
    const kind = deriveBumpKind(title, body)
    expect(bumpSemver('0.1.0', kind)).toBe('0.2.0')
  })

  it('BREAKING CHANGE PR bumps major', () => {
    const title = 'feat(knowledge): drop deprecated entries'
    const body = 'Cleanup.\n\nBREAKING CHANGE: removes 5 entries'
    const kind = deriveBumpKind(title, body)
    expect(bumpSemver('0.1.0', kind)).toBe('1.0.0')
  })
})
