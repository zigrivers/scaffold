// src/config/schema.test.ts

import { describe, it, expect } from 'vitest'
import { ConfigSchema } from './schema.js'

describe('ConfigSchema', () => {
  it('accepts a valid minimal config', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
    })
    expect(result.success).toBe(true)
  })

  it('accepts a valid full config', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'custom',
      platforms: ['claude-code', 'codex'],
      custom: {
        default_depth: 3,
        steps: {
          'prd': { enabled: true, depth: 2 },
        },
      },
      project: {
        name: 'my-app',
        platforms: ['web'],
      },
    })
    expect(result.success).toBe(true)
  })

  it('accepts a valid config with gemini platform', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code', 'gemini'],
    })
    expect(result.success).toBe(true)
  })

  it('fails when methodology is missing', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      platforms: ['claude-code'],
    })
    expect(result.success).toBe(false)
  })

  it('fails when platforms is missing', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
    })
    expect(result.success).toBe(false)
  })

  it('fails when platforms is empty', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: [],
    })
    expect(result.success).toBe(false)
  })

  it('fails with invalid methodology enum', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'extreme',
      platforms: ['claude-code'],
    })
    expect(result.success).toBe(false)
  })

  it('fails with invalid platform enum', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['unknown-platform'],
    })
    expect(result.success).toBe(false)
  })

  it('fails when depth is out of 1-5 range', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'custom',
      platforms: ['claude-code'],
      custom: {
        steps: {
          'prd': { depth: 6 },
        },
      },
    })
    expect(result.success).toBe(false)
  })

  it('fails when depth is below 1', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'custom',
      platforms: ['claude-code'],
      custom: {
        default_depth: 0,
      },
    })
    expect(result.success).toBe(false)
  })

  it('passes unknown top-level fields through (passthrough)', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      future_field: 'some-value',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>)['future_field']).toBe('some-value')
    }
  })

  it('passes unknown project fields through (passthrough on project)', () => {
    const result = ConfigSchema.safeParse({
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        name: 'my-app',
        unknown_project_field: true,
      },
    })
    expect(result.success).toBe(true)
  })

  it('fails when version is not 2', () => {
    const result = ConfigSchema.safeParse({
      version: 1,
      methodology: 'deep',
      platforms: ['claude-code'],
    })
    expect(result.success).toBe(false)
  })
})
