import { describe, it, expect } from 'vitest'
import { LENS_REGISTRY, getLensManifest } from './registry.js'

describe('LENS_REGISTRY', () => {
  it('has all eight lenses', () => {
    const ids = LENS_REGISTRY.map((m) => m.id).sort()
    expect(ids).toEqual([
      'A-tdd', 'B-ac-coverage', 'C-standards', 'D-stack', 'E-design', 'F-scope', 'G-decisions', 'H-cross-doc',
    ])
  })

  it('every entry declares fast profile membership', () => {
    for (const m of LENS_REGISTRY) expect(m.profiles).toContain('fast')
  })

  it('G-decisions declares depends_on D-stack so the runner orders them correctly', () => {
    const g = getLensManifest('G-decisions')
    expect(g?.depends_on).toEqual(['D-stack'])
  })

  it('B-ac-coverage and F-scope declare optional adapters consistent with their fast checks', () => {
    expect(getLensManifest('B-ac-coverage')?.optional).toEqual(['tests', 'gh'])
    expect(getLensManifest('F-scope')?.optional).toContain('state')
  })
})
