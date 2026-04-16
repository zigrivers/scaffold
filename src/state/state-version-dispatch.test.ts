import { describe, it, expect } from 'vitest'
import { dispatchStateMigration } from './state-version-dispatch.js'

describe('dispatchStateMigration', () => {
  it('accepts v1 state when hasServices is false (no bump)', () => {
    const raw: Record<string, unknown> = { 'schema-version': 1, foo: 'bar' }
    dispatchStateMigration(raw, { hasServices: false }, 'state.json')
    expect(raw['schema-version']).toBe(1)
  })

  it('bumps v1 → v2 in place when hasServices is true', () => {
    const raw: Record<string, unknown> = { 'schema-version': 1, foo: 'bar' }
    dispatchStateMigration(raw, { hasServices: true }, 'state.json')
    expect(raw['schema-version']).toBe(2)
  })

  it('accepts v2 state unchanged regardless of hasServices', () => {
    const raw: Record<string, unknown> = { 'schema-version': 2, foo: 'bar' }
    dispatchStateMigration(raw, { hasServices: true }, 'state.json')
    expect(raw['schema-version']).toBe(2)
  })

  it('throws on missing schema-version', () => {
    expect(() =>
      dispatchStateMigration({}, { hasServices: false }, 'state.json'),
    ).toThrow()
  })

  it('throws on unknown schema-version', () => {
    expect(() =>
      dispatchStateMigration(
        { 'schema-version': 99 }, { hasServices: false }, 'state.json',
      ),
    ).toThrow()
  })

  it('throws on non-object raw input', () => {
    expect(() =>
      dispatchStateMigration('not an object', { hasServices: false }, 'state.json'),
    ).toThrow()
    expect(() =>
      dispatchStateMigration(null, { hasServices: false }, 'state.json'),
    ).toThrow()
  })
})
