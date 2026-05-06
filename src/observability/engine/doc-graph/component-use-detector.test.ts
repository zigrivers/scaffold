import { describe, it, expect } from 'vitest'
import { detectComponentUses } from './component-use-detector.js'
import type { SanctionedComponent } from '../types.js'

const components: SanctionedComponent[] = [
  { id: 'component:react',       package_or_url: 'react@18',       layer: 'frontend', source_anchor: '' },
  { id: 'component:tailwindcss', package_or_url: 'tailwindcss@3',  layer: 'frontend', source_anchor: '' },
  { id: 'component:postgres',    package_or_url: 'postgres@16',    layer: 'data',     source_anchor: '' },
]

describe('detectComponentUses', () => {
  it('matches imports by package name (ignoring version suffix)', () => {
    const ts = `
      import React from 'react'
      import { sql } from 'postgres'
      import { isDeprecated } from 'lodash'
    `
    const uses = detectComponentUses(ts, components, 'src/x.ts')
    expect(uses).toEqual([
      { file: 'src/x.ts', specifier: 'react',    component_id: 'component:react' },
      { file: 'src/x.ts', specifier: 'postgres', component_id: 'component:postgres' },
      { file: 'src/x.ts', specifier: 'lodash',   component_id: 'unsanctioned' },
    ])
  })

  it('treats relative imports as in-repo (skipped, not unsanctioned)', () => {
    const ts = 'import { foo } from \'./foo\'\nimport bar from \'../bar\''
    expect(detectComponentUses(ts, components, 'src/x.ts')).toEqual([])
  })

  it('handles scoped packages like @org/pkg', () => {
    const local: SanctionedComponent[] = [
      { id: 'component:trpc', package_or_url: '@trpc/server@10', layer: 'backend', source_anchor: '' },
    ]
    const ts = 'import { router } from \'@trpc/server\''
    const uses = detectComponentUses(ts, local, 'src/x.ts')
    expect(uses[0]).toMatchObject({ specifier: '@trpc/server', component_id: 'component:trpc' })
  })

  it('returns [] when source has no imports', () => {
    expect(detectComponentUses('export const x = 1', components, 'src/x.ts')).toEqual([])
  })
})
