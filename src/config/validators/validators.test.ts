import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { ALL_COUPLING_VALIDATORS } from './index.js'

describe('coupling validators (parameterized)', () => {
  it.each(ALL_COUPLING_VALIDATORS.map(v => [v.projectType, v]))(
    'validator for %s emits no issue when config is absent (preserves current asymmetric behavior)',
    (_type, validator) => {
      const schema = z.object({}).superRefine((_, ctx) => {
        validator.validate(ctx, [], validator.projectType, undefined)
      })
      const result = schema.safeParse({})
      expect(result.success).toBe(true)
    },
  )

  it.each(ALL_COUPLING_VALIDATORS.map(v => [v.projectType, v]))(
    'validator for %s emits coupling issue when config present with wrong projectType',
    (type, validator) => {
      const schema = z.object({}).superRefine((_, ctx) => {
        const wrongType = type === 'backend' ? 'web-app' : 'backend'
        validator.validate(
          ctx,
          [],
          wrongType as never,
          {} as never,
        )
      })
      const result = schema.safeParse({})
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual([validator.configKey])
        expect(result.error.issues[0].message).toContain(validator.projectType)
      }
    },
  )
})
