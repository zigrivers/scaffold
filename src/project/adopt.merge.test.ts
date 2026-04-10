import { describe, it, expect } from 'vitest'
import { mergeRawConfig, applyFlagOverrides, emitFieldConflictWarnings } from './adopt.js'

describe('mergeRawConfig', () => {
  it('returns detected when existing is undefined', () => {
    const result = mergeRawConfig({ a: 1, b: 2 }, undefined)
    expect(result.merged).toEqual({ a: 1, b: 2 })
    expect(result.conflicts).toEqual([])
  })

  it('existing wins on overlap (scalar values)', () => {
    const result = mergeRawConfig({ a: 1, b: 2 }, { a: 99 })
    expect(result.merged).toEqual({ a: 99, b: 2 })
    expect(result.conflicts).toEqual([{ field: 'a', existing: 99, detected: 1 }])
  })

  it('no conflict when detected and existing agree', () => {
    const result = mergeRawConfig({ a: 1 }, { a: 1 })
    expect(result.merged).toEqual({ a: 1 })
    expect(result.conflicts).toEqual([])
  })

  it('detected fills in fields existing does not set', () => {
    const result = mergeRawConfig({ a: 1, b: 2 }, { c: 3 })
    expect(result.merged).toEqual({ a: 1, b: 2, c: 3 })
    expect(result.conflicts).toEqual([])
  })

  it('handles arrays as opaque values via JSON.stringify comparison', () => {
    const result = mergeRawConfig(
      { dataStore: ['relational', 'redis'] },
      { dataStore: ['relational'] },
    )
    expect(result.merged.dataStore).toEqual(['relational'])    // existing wins entirely
    expect(result.conflicts).toEqual([{
      field: 'dataStore',
      existing: ['relational'],
      detected: ['relational', 'redis'],
    }])
  })

  it('NO conflict when arrays are structurally equal', () => {
    const result = mergeRawConfig(
      { dataStore: ['relational'] },
      { dataStore: ['relational'] },
    )
    expect(result.conflicts).toEqual([])
  })
})

describe('emitFieldConflictWarnings', () => {
  it('produces one ADOPT_FIELD_CONFLICT per conflict', () => {
    const warnings = emitFieldConflictWarnings(
      [{ field: 'renderingStrategy', existing: 'ssr', detected: 'spa' }],
      'webAppConfig',
    )
    expect(warnings).toHaveLength(1)
    expect(warnings[0].code).toBe('ADOPT_FIELD_CONFLICT')
    expect(warnings[0].message).toContain('webAppConfig.renderingStrategy')
    expect(warnings[0].message).toContain('\'"ssr"\'')

  })
})

describe('applyFlagOverrides', () => {
  it('returns base when overrides is undefined', () => {
    expect(applyFlagOverrides({ a: 1 }, undefined)).toEqual({ a: 1 })
  })

  it('overrides replace base values', () => {
    expect(applyFlagOverrides({ a: 1, b: 2 }, { a: 99 })).toEqual({ a: 99, b: 2 })
  })

  it('full precedence: flag overrides existing + detected merge result', () => {
    // Step 1: merge
    const { merged } = mergeRawConfig({ a: 'detected', b: 'detected' }, { a: 'existing' })
    // Step 2: flag overrides
    const final = applyFlagOverrides(merged, { a: 'flag' })
    expect(final).toEqual({ a: 'flag', b: 'detected' })
  })
})
