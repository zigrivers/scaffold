import { describe, it, expect } from 'vitest'
import { deriveBumpKind, bumpSemver } from './bump-version.js'

describe('deriveBumpKind', () => {
  it('returns major when BREAKING CHANGE appears in title', () => {
    expect(
      deriveBumpKind('feat(knowledge): rework API BREAKING CHANGE: drops X', ''),
    ).toBe('major')
  })

  it('returns major when BREAKING CHANGE appears in body even if title is feat', () => {
    expect(
      deriveBumpKind('feat(knowledge): new entry', 'Body line\nBREAKING CHANGE: removes Y'),
    ).toBe('major')
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
