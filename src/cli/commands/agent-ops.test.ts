import { describe, expect, it } from 'vitest'
import { resolveComponents } from './agent-ops.js'

describe('resolveComponents', () => {
  it('maps all to both components', () => {
    expect(resolveComponents('all')).toEqual(['git', 'staging'])
  })
  it('maps single component names', () => {
    expect(resolveComponents('git')).toEqual(['git'])
    expect(resolveComponents('staging')).toEqual(['staging'])
  })
  it('defaults to all when omitted', () => {
    expect(resolveComponents(undefined)).toEqual(['git', 'staging'])
  })
  it('throws on unknown component', () => {
    expect(() => resolveComponents('nope')).toThrow(/unknown component/i)
  })
})
