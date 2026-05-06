import { describe, it, expect } from 'vitest'
import { LENS_REGISTRY, getLensManifest } from './registry.js'

describe('LENS_REGISTRY', () => {
  it('has the three Plan-2 lenses with correct profile membership', () => {
    const ids = LENS_REGISTRY.map((m) => m.id)
    expect(ids).toContain('A-tdd')
    expect(ids).toContain('B-ac-coverage')
    expect(ids).toContain('H-cross-doc')
  })

  it('every entry declares fast profile membership', () => {
    for (const m of LENS_REGISTRY) {
      expect(m.profiles).toContain('fast')
    }
  })

  it('getLensManifest returns the entry by id and undefined otherwise', () => {
    expect(getLensManifest('A-tdd')?.name).toMatch(/TDD/)
    expect(getLensManifest('Z-nope')).toBeUndefined()
  })
})
