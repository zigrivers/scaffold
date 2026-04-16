import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { researchCouplingValidator } from './research.js'

describe('researchCouplingValidator — intra-type rules', () => {
  it('rejects notebook-driven + autonomous combination', () => {
    const schema = z.object({}).superRefine((_, ctx) => {
      researchCouplingValidator.validate(ctx, [], 'research', {
        experimentDriver: 'notebook-driven',
        interactionMode: 'autonomous',
        hasExperimentTracking: true,
        domain: 'none',
      })
    })
    const result = schema.safeParse({})
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['researchConfig', 'interactionMode'])
      expect(result.error.issues[0].message).toMatch(/notebook-driven/i)
    }
  })

  it('allows notebook-driven + checkpoint-gated combination', () => {
    const schema = z.object({}).superRefine((_, ctx) => {
      researchCouplingValidator.validate(ctx, [], 'research', {
        experimentDriver: 'notebook-driven',
        interactionMode: 'checkpoint-gated',
        hasExperimentTracking: true,
        domain: 'none',
      })
    })
    expect(schema.safeParse({}).success).toBe(true)
  })

  it('allows code-driven + autonomous combination', () => {
    const schema = z.object({}).superRefine((_, ctx) => {
      researchCouplingValidator.validate(ctx, [], 'research', {
        experimentDriver: 'code-driven',
        interactionMode: 'autonomous',
        hasExperimentTracking: true,
        domain: 'none',
      })
    })
    expect(schema.safeParse({}).success).toBe(true)
  })
})
