// src/project/adopt.forward-compat.test.ts
import { describe, it, expect } from 'vitest'
import { ConfigSchema as V39Schema } from './__frozen-schemas__/schema-v3.9.2.js'

describe('forward compat: v3.10 output parses under frozen v3.9.2 schema', () => {
  // PRECONDITION: v3.9.2's ProjectSchema must use .passthrough() for unknown fields
  // (verified by spec ADR-033). If the schema is .strict(), these tests will fail
  // and the dual-emit guarantee needs revisiting. The first test below pins this.

  it('PRECONDITION: v3.9.2 ProjectSchema accepts unknown fields (passthrough)', () => {
    const minimal = {
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        projectType: 'web-app',
        // unknown field that v3.9.2 doesn't know about
        someUnknownField: 'allowed by passthrough',
      },
    }
    const result = V39Schema.safeParse(minimal)
    if (!result.success) {
      console.error('PRECONDITION FAILED:', result.error.errors)
      console.error('v3.9.2 ProjectSchema is .strict(), not .passthrough().')
      console.error('Forward-compat dual-emit is broken — escalate to user before proceeding.')
    }
    expect(result.success).toBe(true)
  })

  it('a v3.10 game config (with gameConfig dual-emit) parses under v3.9.2', () => {
    const v310Output = {
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        projectType: 'game',
        gameConfig: { engine: 'unity' },              // v3.9.2 knows this
        detectedConfig: { type: 'game', config: { engine: 'unity' } },  // v3.9.2 doesn't, must passthrough
      },
    }
    const result = V39Schema.safeParse(v310Output)
    expect(result.success).toBe(true)
  })

  it('a v3.10 web-app config parses under v3.9.2', () => {
    const v310Output = {
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        projectType: 'web-app',
        webAppConfig: { renderingStrategy: 'ssr' },   // v3.9.2 knows this from R1
        detectedConfig: { type: 'web-app', config: { renderingStrategy: 'ssr' } },
      },
    }
    const result = V39Schema.safeParse(v310Output)
    expect(result.success).toBe(true)
  })

  it('unknown top-level fields like detectionConfidence pass through (ADR-033)', () => {
    const v310Output = {
      version: 2,
      methodology: 'deep',
      platforms: ['claude-code'],
      project: {
        projectType: 'web-app',
        webAppConfig: { renderingStrategy: 'ssr' },
        detectionConfidence: 'high',
        detectionEvidence: [],
      },
    }
    const result = V39Schema.safeParse(v310Output)
    expect(result.success).toBe(true)
  })
})
