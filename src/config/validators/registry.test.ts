import { describe, it, expect } from 'vitest'
import { ProjectTypeSchema } from '../schema.js'
import { ALL_COUPLING_VALIDATORS, PROJECT_TYPE_TO_CONFIG_KEY, configKeyFor } from './index.js'
import type { ProjectType } from '../../types/config.js'

describe('validator registry completeness', () => {
  it('registers exactly one validator per ProjectType', () => {
    const registeredTypes = new Set(ALL_COUPLING_VALIDATORS.map(v => v.projectType))
    const schemaTypes = new Set(ProjectTypeSchema.options as readonly ProjectType[])
    expect(registeredTypes).toEqual(schemaTypes)
    expect(ALL_COUPLING_VALIDATORS).toHaveLength(schemaTypes.size)
  })

  it('has unique configKey per validator', () => {
    const keys = ALL_COUPLING_VALIDATORS.map(v => v.configKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('PROJECT_TYPE_TO_CONFIG_KEY matches registry', () => {
    for (const v of ALL_COUPLING_VALIDATORS) {
      expect(PROJECT_TYPE_TO_CONFIG_KEY[v.projectType]).toBe(v.configKey)
    }
  })

  it('configKeyFor returns the correct key per type', () => {
    for (const v of ALL_COUPLING_VALIDATORS) {
      expect(configKeyFor(v.projectType)).toBe(v.configKey)
    }
  })
})
