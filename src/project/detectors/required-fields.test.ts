import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { getRequiredFieldsWithoutDefaults } from './required-fields.js'
import { WebAppConfigSchema, BackendConfigSchema } from '../../config/schema.js'

describe('getRequiredFieldsWithoutDefaults', () => {
  it('returns the anchor field for WebAppConfigSchema', () => {
    const required = getRequiredFieldsWithoutDefaults(WebAppConfigSchema)
    expect(required).toEqual(['renderingStrategy'])
  })

  it('returns the anchor field for BackendConfigSchema', () => {
    const required = getRequiredFieldsWithoutDefaults(BackendConfigSchema)
    expect(required).toEqual(['apiStyle'])
  })

  it('excludes optional fields', () => {
    const schema = z.object({
      a: z.string(),
      b: z.string().optional(),
      c: z.string().default('c'),
    })
    const required = getRequiredFieldsWithoutDefaults(schema)
    expect(required).toEqual(['a'])
  })
})
