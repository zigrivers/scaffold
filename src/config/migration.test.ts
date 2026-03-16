// src/config/migration.test.ts

import { describe, it, expect } from 'vitest'
import { migrateV1 } from './migration.js'

describe('migrateV1', () => {
  it('migrates classic methodology to deep', () => {
    const result = migrateV1({ version: 1, methodology: 'classic', mixins: {} })
    expect(result.methodology).toBe('deep')
  })

  it('migrates classic-lite methodology to mvp', () => {
    const result = migrateV1({ methodology: 'classic-lite' })
    expect(result.methodology).toBe('mvp')
  })

  it('migrates unknown methodology to custom', () => {
    const result = migrateV1({ methodology: 'anything-else' })
    expect(result.methodology).toBe('custom')
  })

  it('sets version to 2', () => {
    const result = migrateV1({ version: 1, methodology: 'classic' })
    expect(result.version).toBe(2)
  })

  it('removes mixins from output', () => {
    const result = migrateV1({ version: 1, methodology: 'classic', mixins: { key: 'value' } })
    expect(Object.prototype.hasOwnProperty.call(result, 'mixins')).toBe(false)
  })

  it('preserves platforms if already present', () => {
    const result = migrateV1({ version: 1, methodology: 'classic', platforms: ['codex'] })
    expect(result.platforms).toEqual(['codex'])
  })

  it('adds platforms claude-code if missing', () => {
    const result = migrateV1({ version: 1, methodology: 'classic' })
    expect(result.platforms).toEqual(['claude-code'])
  })

  it('preserves project if present', () => {
    const result = migrateV1({ version: 1, methodology: 'classic', project: { name: 'my-app' } })
    expect(result.project).toEqual({ name: 'my-app' })
  })

  it('handles missing version (no version field)', () => {
    const result = migrateV1({ methodology: 'classic', mixins: {} })
    expect(result.version).toBe(2)
    expect(result.methodology).toBe('deep')
    expect(Object.prototype.hasOwnProperty.call(result, 'mixins')).toBe(false)
  })
})
